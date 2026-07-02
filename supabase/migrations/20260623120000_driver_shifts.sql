CREATE TABLE IF NOT EXISTS driver_shifts (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id  uuid NOT NULL REFERENCES drivers(id),
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time   time NOT NULL,
  notes      text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE driver_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver read own shifts"
  ON driver_shifts FOR SELECT
  USING (driver_id = auth.uid());

CREATE INDEX driver_shifts_driver_date_idx
  ON driver_shifts(driver_id, shift_date);
