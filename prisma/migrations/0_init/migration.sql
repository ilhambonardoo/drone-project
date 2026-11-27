-- Baseline from PostgreSQL 16 VPS schema-only dump. Preserve CHECK constraints.
BEGIN;

CREATE SCHEMA IF NOT EXISTS uji;

CREATE TABLE uji.captures (
    capture_id text NOT NULL,
    drone_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    captured_at timestamp with time zone,
    raw_file_path text,
    original_jpg_path text,
    raw_size_bytes bigint,
    jpg_size_bytes bigint,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    CONSTRAINT captures_jpg_size_bytes_check CHECK ((jpg_size_bytes >= 0)),
    CONSTRAINT captures_raw_size_bytes_check CHECK ((raw_size_bytes >= 0)),
    CONSTRAINT captures_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'stored'::text, 'failed'::text])))
);

CREATE TABLE uji.predictions (
    prediction_id uuid NOT NULL,
    capture_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_jpg_path text NOT NULL,
    ndvi_visual_path text NOT NULL,
    classification text NOT NULL,
    class_index smallint NOT NULL,
    prediction_score double precision NOT NULL,
    score_terserang double precision NOT NULL,
    score_sehat double precision NOT NULL,
    threshold double precision NOT NULL,
    ndvi double precision,
    green_mean_scaled double precision,
    red_mean_scaled double precision,
    nir_mean_scaled double precision,
    model_name text NOT NULL,
    model_status text NOT NULL,
    score_calibrated boolean NOT NULL,
    radiometric_mode text NOT NULL,
    radiometric_validated boolean NOT NULL,
    physical_coverage_target_m double precision,
    physical_coverage_validated boolean NOT NULL,
    valid_pixel_percentage double precision,
    automatic_spraying_allowed boolean DEFAULT false NOT NULL,
    preprocessing_version text,
    model_sha256 text,
    config_sha256 text,
    CONSTRAINT predictions_class_index_check CHECK ((class_index = ANY (ARRAY[0, 1]))),
    CONSTRAINT predictions_classification_check CHECK ((classification = ANY (ARRAY['Sehat'::text, 'Terserang'::text]))),
    CONSTRAINT predictions_ndvi_check CHECK (((ndvi >= ('-1'::integer)::double precision) AND (ndvi <= (1)::double precision))),
    CONSTRAINT predictions_prediction_score_check CHECK (((prediction_score >= (0)::double precision) AND (prediction_score <= (1)::double precision))),
    CONSTRAINT predictions_score_sehat_check CHECK (((score_sehat >= (0)::double precision) AND (score_sehat <= (1)::double precision))),
    CONSTRAINT predictions_score_terserang_check CHECK (((score_terserang >= (0)::double precision) AND (score_terserang <= (1)::double precision))),
    CONSTRAINT predictions_threshold_check CHECK (((threshold >= (0)::double precision) AND (threshold <= (1)::double precision))),
    CONSTRAINT predictions_valid_pixel_percentage_check CHECK (((valid_pixel_percentage >= (0)::double precision) AND (valid_pixel_percentage <= (100)::double precision)))
);

ALTER TABLE ONLY uji.captures
    ADD CONSTRAINT captures_pkey PRIMARY KEY (capture_id);

ALTER TABLE ONLY uji.predictions
    ADD CONSTRAINT predictions_pkey PRIMARY KEY (prediction_id);

CREATE INDEX idx_captures_created_at ON uji.captures USING btree (created_at DESC);

CREATE INDEX idx_predictions_capture_id ON uji.predictions USING btree (capture_id);

CREATE INDEX idx_predictions_created_at ON uji.predictions USING btree (created_at DESC);

ALTER TABLE ONLY uji.predictions
    ADD CONSTRAINT predictions_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES uji.captures(capture_id) ON DELETE RESTRICT;

COMMIT;
