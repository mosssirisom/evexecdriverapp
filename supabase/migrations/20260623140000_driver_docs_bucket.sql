-- Storage bucket for driver compliance documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('driver-docs', 'driver-docs', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- RLS: drivers can upload/view/replace their own docs (path: {driver_id}/{doc_type})
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Drivers upload own docs') THEN
    CREATE POLICY "Drivers upload own docs"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Drivers view own docs') THEN
    CREATE POLICY "Drivers view own docs"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Drivers update own docs') THEN
    CREATE POLICY "Drivers update own docs"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Drivers delete own docs') THEN
    CREATE POLICY "Drivers delete own docs"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
