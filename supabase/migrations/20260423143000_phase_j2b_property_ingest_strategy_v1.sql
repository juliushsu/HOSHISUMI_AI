-- Phase J2B: property ingest strategy-based flow and cost observability

alter table public.property_ingest_jobs
  add column if not exists processing_strategy text null,
  add column if not exists recommended_next_step text null,
  add column if not exists key_field_coverage_json jsonb null,
  add column if not exists current_ocr_confidence numeric(5, 4) null,
  add column if not exists token_input_count int null,
  add column if not exists token_output_count int null,
  add column if not exists token_total_count int null,
  add column if not exists estimated_cost_usd numeric(12, 6) null;

alter table public.property_ingest_jobs
  drop constraint if exists property_ingest_jobs_status_check,
  add constraint property_ingest_jobs_status_check
    check (status in ('uploaded', 'ocr_processing', 'ocr_done', 'ocr_low_confidence', 'translating', 'vision_fallback_processing', 'translated', 'pending_review', 'approved', 'rejected', 'failed')),
  drop constraint if exists property_ingest_jobs_processing_strategy_check,
  add constraint property_ingest_jobs_processing_strategy_check
    check (processing_strategy is null or processing_strategy in ('ocr_then_ai', 'hybrid_assist', 'vision_only_fallback')),
  drop constraint if exists property_ingest_jobs_recommended_next_step_check,
  add constraint property_ingest_jobs_recommended_next_step_check
    check (recommended_next_step is null or recommended_next_step in ('ocr_then_ai', 'hybrid_assist', 'vision_only_fallback', 'manual_review')),
  drop constraint if exists property_ingest_jobs_key_field_coverage_is_object,
  add constraint property_ingest_jobs_key_field_coverage_is_object
    check (key_field_coverage_json is null or jsonb_typeof(key_field_coverage_json) = 'object'),
  drop constraint if exists property_ingest_jobs_current_ocr_confidence_check,
  add constraint property_ingest_jobs_current_ocr_confidence_check
    check (current_ocr_confidence is null or (current_ocr_confidence >= 0 and current_ocr_confidence <= 1)),
  drop constraint if exists property_ingest_jobs_token_input_count_check,
  add constraint property_ingest_jobs_token_input_count_check
    check (token_input_count is null or token_input_count >= 0),
  drop constraint if exists property_ingest_jobs_token_output_count_check,
  add constraint property_ingest_jobs_token_output_count_check
    check (token_output_count is null or token_output_count >= 0),
  drop constraint if exists property_ingest_jobs_token_total_count_check,
  add constraint property_ingest_jobs_token_total_count_check
    check (token_total_count is null or token_total_count >= 0),
  drop constraint if exists property_ingest_jobs_estimated_cost_usd_check,
  add constraint property_ingest_jobs_estimated_cost_usd_check
    check (estimated_cost_usd is null or estimated_cost_usd >= 0);

create index if not exists idx_property_ingest_jobs_processing_strategy on public.property_ingest_jobs(processing_strategy);
create index if not exists idx_property_ingest_jobs_recommended_next_step on public.property_ingest_jobs(recommended_next_step);

alter table public.property_ocr_results
  add column if not exists processing_strategy text null,
  add column if not exists key_field_coverage_json jsonb null,
  add column if not exists recommended_next_step text null,
  add column if not exists token_input_count int null,
  add column if not exists token_output_count int null,
  add column if not exists token_total_count int null,
  add column if not exists estimated_cost_usd numeric(12, 6) null;

alter table public.property_ocr_results
  drop constraint if exists property_ocr_results_processing_strategy_check,
  add constraint property_ocr_results_processing_strategy_check
    check (processing_strategy is null or processing_strategy in ('ocr_scan')),
  drop constraint if exists property_ocr_results_key_field_coverage_is_object,
  add constraint property_ocr_results_key_field_coverage_is_object
    check (key_field_coverage_json is null or jsonb_typeof(key_field_coverage_json) = 'object'),
  drop constraint if exists property_ocr_results_recommended_next_step_check,
  add constraint property_ocr_results_recommended_next_step_check
    check (recommended_next_step is null or recommended_next_step in ('ocr_then_ai', 'hybrid_assist', 'vision_only_fallback', 'manual_review')),
  drop constraint if exists property_ocr_results_token_input_count_check,
  add constraint property_ocr_results_token_input_count_check
    check (token_input_count is null or token_input_count >= 0),
  drop constraint if exists property_ocr_results_token_output_count_check,
  add constraint property_ocr_results_token_output_count_check
    check (token_output_count is null or token_output_count >= 0),
  drop constraint if exists property_ocr_results_token_total_count_check,
  add constraint property_ocr_results_token_total_count_check
    check (token_total_count is null or token_total_count >= 0),
  drop constraint if exists property_ocr_results_estimated_cost_usd_check,
  add constraint property_ocr_results_estimated_cost_usd_check
    check (estimated_cost_usd is null or estimated_cost_usd >= 0);

alter table public.property_translation_results
  add column if not exists processing_strategy text null,
  add column if not exists key_field_coverage_json jsonb null,
  add column if not exists token_input_count int null,
  add column if not exists token_output_count int null,
  add column if not exists token_total_count int null,
  add column if not exists estimated_cost_usd numeric(12, 6) null;

alter table public.property_translation_results
  drop constraint if exists property_translation_results_processing_strategy_check,
  add constraint property_translation_results_processing_strategy_check
    check (processing_strategy is null or processing_strategy in ('ocr_then_ai', 'hybrid_assist', 'vision_only_fallback')),
  drop constraint if exists property_translation_results_key_field_coverage_is_object,
  add constraint property_translation_results_key_field_coverage_is_object
    check (key_field_coverage_json is null or jsonb_typeof(key_field_coverage_json) = 'object'),
  drop constraint if exists property_translation_results_token_input_count_check,
  add constraint property_translation_results_token_input_count_check
    check (token_input_count is null or token_input_count >= 0),
  drop constraint if exists property_translation_results_token_output_count_check,
  add constraint property_translation_results_token_output_count_check
    check (token_output_count is null or token_output_count >= 0),
  drop constraint if exists property_translation_results_token_total_count_check,
  add constraint property_translation_results_token_total_count_check
    check (token_total_count is null or token_total_count >= 0),
  drop constraint if exists property_translation_results_estimated_cost_usd_check,
  add constraint property_translation_results_estimated_cost_usd_check
    check (estimated_cost_usd is null or estimated_cost_usd >= 0);
