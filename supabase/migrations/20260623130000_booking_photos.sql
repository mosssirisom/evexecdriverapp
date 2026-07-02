-- Storage bucket for job photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('job-photos', 'job-photos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for job-photos bucket
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Drivers upload job photos') THEN
    CREATE POLICY "Drivers upload job photos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'job-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Drivers view job photos') THEN
    CREATE POLICY "Drivers view job photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'job-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Drivers delete job photos') THEN
    CREATE POLICY "Drivers delete job photos"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'job-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- booking_photos metadata table
CREATE TABLE IF NOT EXISTS booking_photos (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  driver_id   uuid NOT NULL REFERENCES drivers(id),
  url         text NOT NULL,
  caption     text,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE booking_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='booking_photos' AND policyname='driver read own booking photos') THEN
    CREATE POLICY "driver read own booking photos" ON booking_photos FOR SELECT USING (driver_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='booking_photos' AND policyname='driver insert own booking photos') THEN
    CREATE POLICY "driver insert own booking photos" ON booking_photos FOR INSERT WITH CHECK (driver_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='booking_photos' AND policyname='driver delete own booking photos') THEN
    CREATE POLICY "driver delete own booking photos" ON booking_photos FOR DELETE USING (driver_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS booking_photos_booking_idx ON booking_photos(booking_id);
