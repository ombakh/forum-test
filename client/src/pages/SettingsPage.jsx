import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TiltCard from '../components/TiltCard.jsx';
import { fetchMyProfile, updateMyProfile } from '../services/userService.js';
import { getBrowserTimeZone } from '../utils/dateTime.js';
import { getTimeZoneOptions } from '../utils/timezones.js';

const MAX_CROPPED_IMAGE_BYTES = 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const OUTPUT_CROP_SIZE = 512;
const PROFILE_CROP_VIEWPORT_SIZE = 224;
const PROFILE_CROP_MIN_ZOOM = 1;
const PROFILE_CROP_MAX_ZOOM = 3;
const PROFILE_CROP_ZOOM_STEP = 0.08;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load selected image'));
    image.src = dataUrl;
  });
}

function getCropShiftBounds(imageWidth, imageHeight, zoom) {
  const sourceSize = Math.min(imageWidth, imageHeight);
  const safeZoom = clamp(Number(zoom) || PROFILE_CROP_MIN_ZOOM, PROFILE_CROP_MIN_ZOOM, PROFILE_CROP_MAX_ZOOM);
  const cropSize = sourceSize / safeZoom;
  const maxShiftX = Math.max(0, (imageWidth - cropSize) / 2);
  const maxShiftY = Math.max(0, (imageHeight - cropSize) / 2);
  return { cropSize, maxShiftX, maxShiftY };
}

function getCropSourceRect(imageWidth, imageHeight, zoom, offsetX, offsetY) {
  const { cropSize, maxShiftX, maxShiftY } = getCropShiftBounds(imageWidth, imageHeight, zoom);

  const normalizedOffsetX = clamp(Number(offsetX) || 0, -100, 100) / 100;
  const normalizedOffsetY = clamp(Number(offsetY) || 0, -100, 100) / 100;

  const centerX = imageWidth / 2 + normalizedOffsetX * maxShiftX;
  const centerY = imageHeight / 2 + normalizedOffsetY * maxShiftY;

  const sx = clamp(centerX - cropSize / 2, 0, Math.max(0, imageWidth - cropSize));
  const sy = clamp(centerY - cropSize / 2, 0, Math.max(0, imageHeight - cropSize));

  return { sx, sy, cropSize };
}

function getCropPreviewTransformStyle(image, crop, viewportSize) {
  const imageWidth = Number(image?.naturalWidth || image?.width || 0);
  const imageHeight = Number(image?.naturalHeight || image?.height || 0);
  const safeViewportSize = Math.max(1, Number(viewportSize) || PROFILE_CROP_VIEWPORT_SIZE);

  if (!imageWidth || !imageHeight) {
    return null;
  }

  const { cropSize, maxShiftX, maxShiftY } = getCropShiftBounds(imageWidth, imageHeight, crop.zoom);
  if (!cropSize) {
    return null;
  }

  const normalizedOffsetX = clamp(Number(crop.offsetX) || 0, -100, 100) / 100;
  const normalizedOffsetY = clamp(Number(crop.offsetY) || 0, -100, 100) / 100;
  const centerX = imageWidth / 2 + normalizedOffsetX * maxShiftX;
  const centerY = imageHeight / 2 + normalizedOffsetY * maxShiftY;
  const scale = safeViewportSize / cropSize;
  const translateX = safeViewportSize / 2 - centerX * scale;
  const translateY = safeViewportSize / 2 - centerY * scale;

  return {
    width: `${Math.max(1, imageWidth * scale)}px`,
    height: `${Math.max(1, imageHeight * scale)}px`,
    transform: `translate3d(${translateX}px, ${translateY}px, 0)`
  };
}

function renderCroppedDataUrl(image, crop, outputSize, mimeType = 'image/webp', quality = 0.9) {
  const width = Number(image?.naturalWidth || image?.width || 0);
  const height = Number(image?.naturalHeight || image?.height || 0);

  if (!width || !height) {
    throw new Error('Image dimensions are invalid');
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image processor unavailable');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const { sx, sy, cropSize } = getCropSourceRect(width, height, crop.zoom, crop.offsetX, crop.offsetY);
  context.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, outputSize, outputSize);

  return canvas.toDataURL(mimeType, quality);
}

function dataUrlByteLength(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) {
    return 0;
  }
  const base64 = parts[1];
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function buildOptimizedCroppedUpload(image, crop) {
  const attempts = [
    ['image/webp', 0.92],
    ['image/webp', 0.82],
    ['image/webp', 0.72],
    ['image/jpeg', 0.9],
    ['image/jpeg', 0.8],
    ['image/jpeg', 0.7]
  ];

  let smallest = { dataUrl: '', bytes: Number.POSITIVE_INFINITY };
  for (const [mimeType, quality] of attempts) {
    const dataUrl = renderCroppedDataUrl(image, crop, OUTPUT_CROP_SIZE, mimeType, quality);
    const bytes = dataUrlByteLength(dataUrl);
    if (bytes < smallest.bytes) {
      smallest = { dataUrl, bytes };
    }
    if (bytes <= MAX_CROPPED_IMAGE_BYTES) {
      return dataUrl;
    }
  }

  return smallest.dataUrl;
}

function SettingsPage({ user, onUserUpdated }) {
  const isOmOverrideUser =
    String(user?.email || '').trim().toLowerCase() === 'ombakh28@gmail.com' ||
    String(user?.name || '').trim().toLowerCase() === 'om bakhshi';
  const minHandleLength = isOmOverrideUser ? 2 : 3;
  const handlePattern = isOmOverrideUser ? '^@?[A-Za-z0-9_]{2,20}$' : '^@?[A-Za-z0-9_]{3,20}$';

  const [form, setForm] = useState({
    name: '',
    handle: '',
    bio: '',
    timezone: getBrowserTimeZone() || 'America/New_York'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [cropDraft, setCropDraft] = useState(null);
  const [cropSourceUrl, setCropSourceUrl] = useState('');
  const [cropPreviewUrl, setCropPreviewUrl] = useState('');
  const [cropViewportSize, setCropViewportSize] = useState(PROFILE_CROP_VIEWPORT_SIZE);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const timeZoneOptions = useMemo(() => getTimeZoneOptions(form.timezone), [form.timezone]);
  const cropImageRef = useRef(null);
  const cropViewportRef = useRef(null);
  const cropDragRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const me = await fetchMyProfile();
        if (active) {
          setForm({
            name: me.name || '',
            handle: me.handle || '',
            bio: me.bio || '',
            timezone: me.timezone || getBrowserTimeZone() || 'America/New_York'
          });
          setProfileImageUrl(me.profileImageUrl || '');
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Could not load account settings');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [user]);

  function onChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  }

  useEffect(() => {
    if (!cropDraft || !cropImageRef.current) {
      setCropPreviewUrl('');
      return;
    }

    try {
      const previewUrl = renderCroppedDataUrl(
        cropImageRef.current,
        cropDraft,
        PROFILE_CROP_VIEWPORT_SIZE,
        'image/webp',
        0.82
      );
      setCropPreviewUrl(previewUrl);
    } catch (_error) {
      setCropPreviewUrl('');
    }
  }, [cropDraft]);

  useEffect(() => {
    const viewportElement = cropViewportRef.current;
    if (!cropDraft || !viewportElement) {
      setCropViewportSize(PROFILE_CROP_VIEWPORT_SIZE);
      return;
    }

    function syncViewportSize() {
      const nextSize = Math.max(1, Math.round(viewportElement.clientWidth || PROFILE_CROP_VIEWPORT_SIZE));
      setCropViewportSize((current) => (current === nextSize ? current : nextSize));
    }

    syncViewportSize();
    if (typeof ResizeObserver !== 'function') {
      return;
    }

    const observer = new ResizeObserver(syncViewportSize);
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, [cropDraft]);

  function clearCropDraft() {
    cropImageRef.current = null;
    cropDragRef.current = null;
    setCropDraft(null);
    setCropSourceUrl('');
    setCropPreviewUrl('');
    setCropViewportSize(PROFILE_CROP_VIEWPORT_SIZE);
  }

  function nudgeCropZoom(step) {
    setCropDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        zoom: clamp(
          (Number(current.zoom) || PROFILE_CROP_MIN_ZOOM) + step,
          PROFILE_CROP_MIN_ZOOM,
          PROFILE_CROP_MAX_ZOOM
        )
      };
    });
  }

  function resetCropPosition() {
    setCropDraft((current) =>
      current
        ? {
            ...current,
            zoom: PROFILE_CROP_MIN_ZOOM,
            offsetX: 0,
            offsetY: 0
          }
        : current
    );
  }

  function applyCropDrag(deltaX, deltaY) {
    setCropDraft((current) => {
      if (!current || !cropImageRef.current) {
        return current;
      }

      const imageWidth = Number(cropImageRef.current.naturalWidth || cropImageRef.current.width || 0);
      const imageHeight = Number(cropImageRef.current.naturalHeight || cropImageRef.current.height || 0);
      if (!imageWidth || !imageHeight) {
        return current;
      }

      const viewportSize = Math.max(1, Number(cropViewportSize) || PROFILE_CROP_VIEWPORT_SIZE);
      const { cropSize, maxShiftX, maxShiftY } = getCropShiftBounds(imageWidth, imageHeight, current.zoom);
      const scale = cropSize > 0 ? viewportSize / cropSize : 0;
      if (!scale) {
        return current;
      }

      let nextOffsetX = current.offsetX;
      let nextOffsetY = current.offsetY;

      if (maxShiftX > 0) {
        const sourceDeltaX = -deltaX / scale;
        nextOffsetX = clamp(current.offsetX + (sourceDeltaX / maxShiftX) * 100, -100, 100);
      }

      if (maxShiftY > 0) {
        const sourceDeltaY = -deltaY / scale;
        nextOffsetY = clamp(current.offsetY + (sourceDeltaY / maxShiftY) * 100, -100, 100);
      }

      return {
        ...current,
        offsetX: nextOffsetX,
        offsetY: nextOffsetY
      };
    });
  }

  function onCropPointerDown(event) {
    if (!cropDraft || photoBusy || saving) {
      return;
    }
    if (event.pointerType !== 'touch' && event.button !== 0) {
      return;
    }

    event.preventDefault();
    cropDragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onCropPointerMove(event) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - drag.clientX;
    const deltaY = event.clientY - drag.clientY;
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    applyCropDrag(deltaX, deltaY);
  }

  function onCropPointerEnd(event) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onCropViewportWheel(event) {
    if (!cropDraft || photoBusy || saving) {
      return;
    }

    event.preventDefault();
    nudgeCropZoom(event.deltaY < 0 ? PROFILE_CROP_ZOOM_STEP : -PROFILE_CROP_ZOOM_STEP);
  }

  async function onPhotoSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      setSuccess('');
      return;
    }

    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setError('Selected image is too large. Please choose one under 8MB.');
      setSuccess('');
      return;
    }

    setPhotoBusy(true);
    setError('');
    setSuccess('');

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImageFromDataUrl(dataUrl);
      cropImageRef.current = image;
      setCropSourceUrl(dataUrl);
      setCropDraft({
        zoom: PROFILE_CROP_MIN_ZOOM,
        offsetX: 0,
        offsetY: 0
      });
      setSuccess('Drag your photo to position it, then save.');
    } catch (updateError) {
      setError(updateError.message || 'Could not load selected photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  const cropTransformStyle = useMemo(() => {
    if (!cropDraft || !cropImageRef.current) {
      return null;
    }

    return getCropPreviewTransformStyle(cropImageRef.current, cropDraft, cropViewportSize);
  }, [cropDraft, cropViewportSize]);

  async function onSaveCroppedPhoto() {
    if (!cropDraft || !cropImageRef.current || photoBusy) {
      return;
    }

    setPhotoBusy(true);
    setError('');
    setSuccess('');

    try {
      const croppedDataUrl = buildOptimizedCroppedUpload(cropImageRef.current, cropDraft);
      const croppedSize = dataUrlByteLength(croppedDataUrl);

      if (!croppedDataUrl || croppedSize > MAX_CROPPED_IMAGE_BYTES) {
        throw new Error('Could not crop this image to under 1MB. Try a different source image.');
      }

      const updated = await updateMyProfile({ profileImageUrl: croppedDataUrl });
      onUserUpdated(updated);
      setProfileImageUrl(updated.profileImageUrl || '');
      clearCropDraft();
      setSuccess('Profile photo updated.');
    } catch (updateError) {
      setError(updateError.message || 'Could not save cropped photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemovePhoto() {
    if (!profileImageUrl || photoBusy) {
      return;
    }

    setPhotoBusy(true);
    setError('');
    setSuccess('');

    try {
      const updated = await updateMyProfile({ profileImageUrl: '' });
      onUserUpdated(updated);
      setProfileImageUrl('');
      clearCropDraft();
      setSuccess('Profile photo removed.');
    } catch (updateError) {
      setError(updateError.message || 'Could not remove profile photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updated = await updateMyProfile(form);
      onUserUpdated(updated);
      setForm((current) => ({
        ...current,
        name: updated.name || current.name,
        handle: updated.handle || current.handle,
        bio: updated.bio || '',
        timezone: updated.timezone || current.timezone
      }));
      setProfileImageUrl(updated.profileImageUrl || '');
      setSuccess('Profile updated.');
    } catch (updateError) {
      setError(updateError.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <TiltCard as="section" className="card card--hero">
        <h1 className="page-title">Account Settings</h1>
        <p className="muted">
          <Link to="/login">Login</Link> to manage your profile.
        </p>
      </TiltCard>
    );
  }

  return (
    <TiltCard as="section" className="card card--hero">
      <h1 className="page-title">Account Settings</h1>
      <p className="muted">Update your display info, profile bio, and timezone.</p>

      {loading ? <p className="muted">Loading settings...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="muted">{success}</p> : null}

      {!loading ? (
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="profile-photo-field">
            <span className="profile-photo-preview" aria-hidden="true">
              {profileImageUrl ? <img src={profileImageUrl} alt="" /> : <span>👤</span>}
            </span>
            <div className="profile-photo-actions">
              <label className="btn btn--secondary profile-photo-upload-btn">
                {photoBusy ? 'Loading...' : profileImageUrl ? 'Change photo' : 'Upload photo'}
                <input
                  className="profile-photo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={onPhotoSelected}
                  disabled={photoBusy || saving}
                />
              </label>
              {cropDraft ? (
                <>
                  <button
                    className="btn"
                    type="button"
                    onClick={onSaveCroppedPhoto}
                    disabled={photoBusy || saving}
                  >
                    {photoBusy ? 'Saving...' : 'Save crop'}
                  </button>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={clearCropDraft}
                    disabled={photoBusy || saving}
                  >
                    Cancel crop
                  </button>
                </>
              ) : null}
              {profileImageUrl ? (
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={onRemovePhoto}
                  disabled={photoBusy || saving}
                >
                  Remove photo
                </button>
              ) : null}
              <p className="muted profile-photo-help">
                PNG, JPG, WEBP, or GIF. Source up to 8MB, saved crop up to 1MB.
              </p>
            </div>
          </div>
          {cropDraft ? (
            <div className="profile-photo-cropper">
              <div className="profile-photo-cropper__preview-wrap">
                <div
                  ref={cropViewportRef}
                  className={`profile-photo-cropper__preview-shell${photoBusy || saving ? ' is-disabled' : ''}`}
                  role="application"
                  aria-label="Crop area. Drag the image to position your photo."
                  onPointerDown={onCropPointerDown}
                  onPointerMove={onCropPointerMove}
                  onPointerUp={onCropPointerEnd}
                  onPointerCancel={onCropPointerEnd}
                  onLostPointerCapture={onCropPointerEnd}
                  onWheel={onCropViewportWheel}
                >
                  {cropSourceUrl && cropTransformStyle ? (
                    <img
                      className="profile-photo-cropper__source-image"
                      src={cropSourceUrl}
                      style={cropTransformStyle}
                      alt="Profile photo source"
                      draggable={false}
                    />
                  ) : (
                    <span className="muted">Preparing preview...</span>
                  )}
                  <span className="profile-photo-cropper__mask" aria-hidden="true" />
                </div>
              </div>
              <div className="profile-photo-cropper__controls">
                <p className="muted profile-photo-cropper__hint">
                  Drag to reposition. Use mouse wheel or buttons to zoom.
                </p>
                <div className="profile-photo-cropper__zoom">
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => nudgeCropZoom(-PROFILE_CROP_ZOOM_STEP)}
                    disabled={photoBusy || saving}
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                  <span className="profile-photo-cropper__zoom-value">
                    Zoom {Math.round((cropDraft.zoom || PROFILE_CROP_MIN_ZOOM) * 100)}%
                  </span>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => nudgeCropZoom(PROFILE_CROP_ZOOM_STEP)}
                    disabled={photoBusy || saving}
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={resetCropPosition}
                    disabled={photoBusy || saving}
                  >
                    Reset
                  </button>
                </div>
                <div className="profile-photo-cropper__result">
                  <span className="muted">Saved preview</span>
                  <span className="profile-photo-cropper__result-thumb" aria-hidden="true">
                    {cropPreviewUrl ? <img src={cropPreviewUrl} alt="" /> : null}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          <input
            name="name"
            value={form.name}
            onChange={onChange}
            placeholder="Display name"
            required
          />
          <label className="handle-input" aria-label="Username">
            <span className="handle-input__prefix">@</span>
            <input
              name="handle"
              value={form.handle}
              onChange={onChange}
              placeholder="Username"
              required
              minLength={minHandleLength}
              maxLength={20}
              pattern={handlePattern}
              title={`Use ${minHandleLength}-20 letters, numbers, or underscores`}
            />
          </label>
          <textarea
            name="bio"
            value={form.bio}
            onChange={onChange}
            placeholder="Bio"
            rows={4}
            maxLength={280}
          />
          <label>
            Timezone
            <select name="timezone" value={form.timezone} onChange={onChange} required>
              {timeZoneOptions.map((timeZoneOption) => (
                <option key={timeZoneOption.value} value={timeZoneOption.value}>
                  {timeZoneOption.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit" disabled={saving || photoBusy || Boolean(cropDraft)}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      ) : null}
    </TiltCard>
  );
}

export default SettingsPage;
