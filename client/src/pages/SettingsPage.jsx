import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TiltCard from '../components/TiltCard.jsx';
import { fetchMyProfile, updateMyProfile } from '../services/userService.js';
import { getBrowserTimeZone } from '../utils/dateTime.js';
import { getTimeZoneOptions } from '../utils/timezones.js';

const MAX_CROPPED_IMAGE_BYTES = 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const OUTPUT_CROP_SIZE = 512;

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

function getCropSourceRect(imageWidth, imageHeight, zoom, offsetX, offsetY) {
  const sourceSize = Math.min(imageWidth, imageHeight);
  const safeZoom = clamp(Number(zoom) || 1, 1, 3);
  const cropSize = sourceSize / safeZoom;

  const maxShiftX = Math.max(0, (imageWidth - cropSize) / 2);
  const maxShiftY = Math.max(0, (imageHeight - cropSize) / 2);

  const normalizedOffsetX = clamp(Number(offsetX) || 0, -100, 100) / 100;
  const normalizedOffsetY = clamp(Number(offsetY) || 0, -100, 100) / 100;

  const centerX = imageWidth / 2 + normalizedOffsetX * maxShiftX;
  const centerY = imageHeight / 2 + normalizedOffsetY * maxShiftY;

  const sx = clamp(centerX - cropSize / 2, 0, Math.max(0, imageWidth - cropSize));
  const sy = clamp(centerY - cropSize / 2, 0, Math.max(0, imageHeight - cropSize));

  return { sx, sy, cropSize };
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
  const [cropPreviewUrl, setCropPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const timeZoneOptions = useMemo(() => getTimeZoneOptions(form.timezone), [form.timezone]);
  const cropImageRef = useRef(null);

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
      const previewUrl = renderCroppedDataUrl(cropImageRef.current, cropDraft, 224, 'image/webp', 0.82);
      setCropPreviewUrl(previewUrl);
    } catch (_error) {
      setCropPreviewUrl('');
    }
  }, [cropDraft]);

  function clearCropDraft() {
    cropImageRef.current = null;
    setCropDraft(null);
    setCropPreviewUrl('');
  }

  function onCropControlChange(field, value) {
    setCropDraft((current) => (current ? { ...current, [field]: value } : current));
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
      setCropDraft({
        zoom: 1,
        offsetX: 0,
        offsetY: 0
      });
      setSuccess('Adjust crop and save your photo.');
    } catch (updateError) {
      setError(updateError.message || 'Could not load selected photo');
    } finally {
      setPhotoBusy(false);
    }
  }

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
                <div className="profile-photo-cropper__preview">
                  {cropPreviewUrl ? (
                    <img src={cropPreviewUrl} alt="Profile photo crop preview" />
                  ) : (
                    <span className="muted">Preparing preview...</span>
                  )}
                </div>
              </div>
              <div className="profile-photo-cropper__controls">
                <label>
                  Zoom ({Math.round((cropDraft.zoom || 1) * 100)}%)
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={cropDraft.zoom}
                    onChange={(event) => onCropControlChange('zoom', Number(event.target.value))}
                    disabled={photoBusy || saving}
                  />
                </label>
                <label>
                  Horizontal ({Math.round(cropDraft.offsetX || 0)})
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={cropDraft.offsetX}
                    onChange={(event) => onCropControlChange('offsetX', Number(event.target.value))}
                    disabled={photoBusy || saving}
                  />
                </label>
                <label>
                  Vertical ({Math.round(cropDraft.offsetY || 0)})
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={cropDraft.offsetY}
                    onChange={(event) => onCropControlChange('offsetY', Number(event.target.value))}
                    disabled={photoBusy || saving}
                  />
                </label>
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
