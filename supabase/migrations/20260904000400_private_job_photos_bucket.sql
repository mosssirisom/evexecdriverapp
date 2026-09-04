-- Make job-photos storage bucket private.
--
-- Previously the bucket was created with public=true, making every uploaded
-- URL world-accessible without authentication. Job photos may include damage
-- reports, incident evidence, or other sensitive content.
--
-- After this migration:
--   - The bucket itself is private (public=false).
--   - The existing driver-scoped RLS policies remain unchanged.
--   - The app must use createSignedUrl() (short-lived URLs) instead of
--     getPublicUrl() when displaying or sharing photos.

UPDATE storage.buckets
SET    public = false
WHERE  id = 'job-photos';
