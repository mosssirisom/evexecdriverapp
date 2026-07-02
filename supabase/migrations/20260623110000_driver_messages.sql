CREATE TABLE IF NOT EXISTS driver_messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id   uuid NOT NULL REFERENCES drivers(id),
  body        text NOT NULL,
  from_driver boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now() NOT NULL,
  read_at     timestamptz
);

ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver read own messages"
  ON driver_messages FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "driver insert own messages"
  ON driver_messages FOR INSERT
  WITH CHECK (driver_id = auth.uid() AND from_driver = true);

CREATE INDEX driver_messages_driver_created_idx
  ON driver_messages(driver_id, created_at ASC);
