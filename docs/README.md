# PrivacyLens Documentation

This directory contains documentation for various components and features of the PrivacyLens system.

## Core System Documentation

- [Assessment Trigger Service Specification](assessment_trigger_service_spec.md) - Details the service that periodically processes unassessed URLs
- [Policies Archive Flow](policies_archive_flow.md) - Explains how privacy policies are added and queued for archiving
- [Deep Crawler Specification](deep_crawler_spec.md) - Describes the policy sub-tree crawler and versioning extension
- [Logging Specification](logging_spec.md) - Outlines the server-side logging framework

## Feature Documentation

- [Domain Normalization](domain-normalization.md) - Explains how subdomains are normalized for assessment purposes
- [Policy Link Design Specification](design_spec_policy_link.md) - Details adding privacy policy links to the Chrome plugin
- [Search for Policy](search_for_policy.md) - Describes the process for finding privacy policies
- [Versioning and Deduplication](versioning_deduplication.md) - Explains how policy versions are managed and deduplicated

## Authentication and Security

- [Auth Setup Guide](auth_setup_guide.md) - Guide for setting up authentication
- [User Authentication Design Specification](design_spec_user_auth.md) - Details the user authentication system
- [Enable RLS (Row-Level Security)](enable_rls.md) - Instructions for enabling row-level security in the database

## Plugin Documentation

- [Plugin Design Specification v2](design_spec_v2.md) - Outlines the Chrome plugin design
- [GTM Landing Page](gtm_landing_pg.md) - Go-to-market landing page content

## Archiver Documentation

- [Archive Specification](archive_spec.md) - Describes the policy archiving system
- [Archiver Improvements](README-archiver-improvements.md) - Details improvements to the archiver
- [Retroactive Archiving](README-retroactive-archiving.md) - Explains the retroactive archiving process
