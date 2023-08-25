CREATE DATABASE cbkpermissionsdb;

CREATE TABLE "users" (
    "user_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) ,
    "password" VARCHAR(255) NOT NULL,
    "mobile" BIGINT NOT NULL,
    "is_admin" BOOLEAN NOT NULL,
    PRIMARY KEY ("user_id"),
    CONSTRAINT "users_email_unique" UNIQUE ("email"),
    CONSTRAINT "users_mobile_unique" UNIQUE ("mobile")
);

CREATE TABLE "requests" (
    "id" SERIAL NOT NULL,
    "req_datetime" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
    "req_type" VARCHAR(255) NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "time_from" TIME(0) WITHOUT TIME ZONE NOT NULL,
    "time_to" TIME(0) WITHOUT TIME ZONE NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "reason" TEXT NOT NULL,
    "attachment" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    PRIMARY KEY ("id"),
    CONSTRAINT "requests_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id"),
    CONSTRAINT "requests_req_type_check" CHECK (req_type::text = ANY (ARRAY['permission', 'annual leave', 'sick leave', 'emergency leave', 'maternity leave', 'other leave', 'swap']::text[])),
    CONSTRAINT "requests_status_check" CHECK (status::text = ANY (ARRAY['pending', 'approved', 'rejected']::text[]))
);
CREATE INDEX "requests_user_id_index" ON "requests" ("user_id");