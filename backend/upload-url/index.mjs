/**
 * Lambda: generate a presigned S3 PUT URL for a contact photo upload.
 *
 * API Gateway route:  GET /upload-url?contactId=<id>
 * Response:           { uploadUrl, publicUrl }
 *
 * The browser then:
 *   1. PUTs the file directly to `uploadUrl`  (no AWS keys in the browser)
 *   2. Stores `publicUrl` in node.photo
 *
 * Environment variables (set in AWS Console or template.yaml):
 *   BUCKET_NAME   – name of your S3 bucket  (e.g. "knotty-photos")
 *   AWS_REGION    – automatically set by Lambda runtime
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl }               from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({})   // credentials come from the Lambda's IAM role — no hardcoded keys

const BUCKET       = process.env.BUCKET_NAME          // required
const EXPIRES_SEC  = 60                               // presigned URL valid for 60 seconds
const MAX_BYTES    = 5 * 1024 * 1024                  // 5 MB safety cap

// ─── CORS — update ALLOWED_ORIGIN to your frontend domain ────────────────────
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN ?? '*'

const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  // Pre-flight CORS request from the browser
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' }
  }

  // ── Input validation ───────────────────────────────────────────────────────
  if (!BUCKET) {
    return error(500, 'BUCKET_NAME env var is not set')
  }

  const contactId = event.queryStringParameters?.contactId
  if (!contactId || !/^[\w-]{1,64}$/.test(contactId)) {
    return error(400, 'Missing or invalid contactId (alphanumeric / dash, max 64 chars)')
  }

  // ── Caller identity (Cognito JWT injected by API Gateway) ─────────────────
  // When you attach a Cognito authorizer to the API Gateway route, the user's
  // sub (unique ID) is available here.  Use it to namespace photos per user
  // so users cannot overwrite each other's files.
  //
  // const userId = event.requestContext?.authorizer?.jwt?.claims?.sub ?? 'anon'
  // const key = `photos/${userId}/${contactId}.jpg`
  //
  // For now (no auth on the Lambda side) we use just the contactId:
  const key = `photos/${contactId}.jpg`

  // ── Generate presigned URL ─────────────────────────────────────────────────
  try {
    const command = new PutObjectCommand({
      Bucket:        BUCKET,
      Key:           key,
      ContentType:   'image/jpeg',
      ContentLength: MAX_BYTES,   // S3 rejects uploads larger than this
    })

    const uploadUrl  = await getSignedUrl(s3, command, { expiresIn: EXPIRES_SEC })
    const publicUrl  = `https://${BUCKET}.s3.amazonaws.com/${key}`
    // If you add CloudFront later, replace publicUrl with your CDN domain:
    // const publicUrl = `https://<your-cf-id>.cloudfront.net/${key}`

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadUrl, publicUrl }),
    }
  } catch (err) {
    console.error('S3 presign error', err)
    return error(500, 'Failed to generate upload URL')
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function error(statusCode, message) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  }
}
