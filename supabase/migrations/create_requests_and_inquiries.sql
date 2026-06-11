-- Create requests_and_inquiries table
CREATE TABLE IF NOT EXISTS requests_and_inquiries (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id   text,
  client_id        text,
  client_name      text,
  project_name     text,
  inventory_code   text,
  type_of_request  text         NOT NULL,
  sub_type         text,
  request_category text         NOT NULL,
  turnaround_days  integer      NOT NULL,
  description      text,
  submitted_at     timestamptz  DEFAULT now(),
  created_at       timestamptz  DEFAULT now()
);
