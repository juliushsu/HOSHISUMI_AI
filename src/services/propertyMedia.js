import { createServiceSupabase } from '../lib/supabase.js';

export const PROPERTY_PREVIEW_SIGNED_URL_TTL_SECONDS = 60 * 15;

function normalizeUrlArray(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === 'string' && value.trim().length > 0);
}

function buildPropertyFieldMedia(urls, source) {
  return urls.map((url) => ({
    url,
    source,
    ingest_job_id: null,
    expires_in_seconds: null
  }));
}

async function createSignedUrl(serviceSupabase, fileRow) {
  try {
    const { data, error } = await serviceSupabase.storage
      .from(fileRow.storage_bucket)
      .createSignedUrl(fileRow.storage_path, PROPERTY_PREVIEW_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function fetchIngestPreviewMediaByPropertyIds(propertyIds) {
  const normalizedIds = [...new Set((propertyIds ?? []).filter((value) => typeof value === 'string' && value.length > 0))];
  if (normalizedIds.length === 0) return new Map();

  const serviceSupabase = createServiceSupabase();

  const { data: jobs, error: jobsError } = await serviceSupabase
    .from('property_ingest_jobs')
    .select('id,approved_property_id,approved_at')
    .in('approved_property_id', normalizedIds)
    .not('approved_property_id', 'is', null)
    .order('approved_at', { ascending: false });

  if (jobsError) {
    throw new Error(`PROPERTY_MEDIA_JOB_LOOKUP_FAILED: ${jobsError.message}`);
  }

  const jobRows = jobs ?? [];
  if (jobRows.length === 0) return new Map();

  const jobIds = jobRows.map((row) => row.id);
  const { data: files, error: filesError } = await serviceSupabase
    .from('property_ingest_files')
    .select('id,job_id,storage_bucket,storage_path,original_file_name,mime_type,size_bytes,file_kind,created_at')
    .in('job_id', jobIds)
    .order('created_at', { ascending: true });

  if (filesError) {
    throw new Error(`PROPERTY_MEDIA_FILE_LOOKUP_FAILED: ${filesError.message}`);
  }

  const filesByJobId = new Map();
  for (const fileRow of files ?? []) {
    const list = filesByJobId.get(fileRow.job_id) ?? [];
    list.push(fileRow);
    filesByJobId.set(fileRow.job_id, list);
  }

  const mediaByPropertyId = new Map();
  for (const jobRow of jobRows) {
    const propertyId = jobRow.approved_property_id;
    if (!propertyId || mediaByPropertyId.has(propertyId)) continue;

    const jobFiles = (filesByJobId.get(jobRow.id) ?? [])
      .filter((fileRow) => fileRow.file_kind === 'raw_source' || fileRow.file_kind == null);

    const mediaItems = [];
    for (const fileRow of jobFiles) {
      const signedUrl = await createSignedUrl(serviceSupabase, fileRow);
      mediaItems.push({
        url: signedUrl,
        source: 'property_ingest_raw',
        ingest_job_id: jobRow.id,
        expires_in_seconds: signedUrl ? PROPERTY_PREVIEW_SIGNED_URL_TTL_SECONDS : null,
        storage_bucket: fileRow.storage_bucket,
        storage_path: fileRow.storage_path,
        original_file_name: fileRow.original_file_name,
        mime_type: fileRow.mime_type,
        file_kind: fileRow.file_kind ?? 'raw_source'
      });
    }

    mediaByPropertyId.set(propertyId, mediaItems);
  }

  return mediaByPropertyId;
}

export function applyPropertyMediaFallback(row, previewMedia = [], mode = 'public') {
  if (mode === 'admin') {
    const galleryUrls = normalizeUrlArray(row.gallery_urls);
    const previewUrls = previewMedia.map((item) => item.url).filter(Boolean);
    const fieldMedia = [
      ...buildPropertyFieldMedia(row.cover_image_url ? [row.cover_image_url] : [], 'property_cover_image'),
      ...buildPropertyFieldMedia(galleryUrls, 'property_gallery')
    ];
    const propertyMedia = fieldMedia.length > 0 ? fieldMedia : previewMedia;
    const resolvedGalleryUrls = galleryUrls.length > 0 ? galleryUrls : previewUrls;
    const primaryImageUrl = row.cover_image_url ?? resolvedGalleryUrls[0] ?? null;

    return {
      ...row,
      gallery_urls: resolvedGalleryUrls,
      primary_image_url: primaryImageUrl,
      image_url: primaryImageUrl,
      property_media: propertyMedia
    };
  }

  const legacyImages = normalizeUrlArray(row.images);
  const previewUrls = previewMedia.map((item) => item.url).filter(Boolean);
  const fieldMedia = buildPropertyFieldMedia(legacyImages, 'property_images');
  const propertyMedia = fieldMedia.length > 0 ? fieldMedia : previewMedia;
  const resolvedImages = legacyImages.length > 0 ? legacyImages : previewUrls;
  const primaryImageUrl = resolvedImages[0] ?? null;

  return {
    ...row,
    images: resolvedImages,
    primary_image_url: primaryImageUrl,
    image_url: primaryImageUrl,
    property_media: propertyMedia
  };
}
