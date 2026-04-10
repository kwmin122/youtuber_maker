# Google OAuth Verification Checklist

**Created:** 2026-04-07
**Purpose:** Track Google OAuth verification and YouTube API quota requests for YouTuber Min SaaS.

## OAuth Consent Screen

- [ ] App name configured: "YouTuber Min - AI Shorts Factory"
- [ ] Support email set
- [ ] App logo uploaded (512x512)
- [ ] Privacy policy URL added
- [ ] Terms of service URL added
- [ ] App domain verified

## Scopes Registered

### Login Scopes (basic, non-restricted)
- [ ] `openid` — OpenID Connect
- [ ] `email` — User email
- [ ] `profile` — User profile info

### YouTube Scopes (restricted — requires verification)
- [ ] `https://www.googleapis.com/auth/youtube.upload` — Upload videos
- [ ] `https://www.googleapis.com/auth/youtube` — Manage YouTube account

## OAuth Verification Submission

Google requires verification for restricted scopes (youtube.upload). This process takes 4-8 weeks and may require a security assessment.

### Pre-submission Requirements
- [ ] Privacy policy published at a public URL
- [ ] Terms of service published at a public URL
- [ ] Demo video showing scope usage (YouTube upload flow)
- [ ] Detailed scope justification written
- [ ] Homepage URL set and verified

### Submission
- [ ] OAuth verification submitted to Google
- [ ] Submission date recorded: ____
- [ ] Expected approval: ____ (4-8 weeks from submission)
- [ ] Verification status: ____

### During Verification Period
- [ ] Test users added (up to 100 allowed during testing)
- [ ] Test user emails documented

## YouTube Data API v3

### API Enablement
- [ ] YouTube Data API v3 enabled in Google Cloud Console
- [ ] API key created (for public data access)

### Quota Increase Request
- [ ] Default quota noted: 10,000 units/day
- [ ] Quota increase request submitted
- [ ] Submission date recorded: ____
- [ ] Requested quota amount: ____
- [ ] Use case description: "AI-automated YouTube Shorts creation and upload SaaS"
- [ ] Estimated daily usage:
  - uploads (1,600 units/call): ____ calls/day
  - videos.list (1 unit/call): ____ calls/day
  - channels.list (1 unit/call): ____ calls/day

## Notes

- YouTube upload OAuth is a **separate connection flow** from login OAuth (Decision D-03).
- Login uses basic scopes (email, profile) and does NOT require verification.
- YouTube upload uses restricted scopes and DOES require verification.
- During the verification waiting period, up to 100 test users can use the app.
- Phase 6 (YouTube Upload) depends on this verification being approved.
