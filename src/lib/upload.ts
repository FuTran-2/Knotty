// ─────────────────────────────────────────────────────────────────────────────
// Photo upload abstraction
//
// Mode is chosen automatically based on .env.local:
//
//   No S3 keys set  →  client-side resize + base64  (default, no AWS needed)
//   S3 keys set     →  uploads directly to S3 using the AWS SDK
//
// To enable S3, add these to .env.local (see instructions below):
//   VITE_AWS_REGION=us-east-1
//   VITE_AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
//   VITE_AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   VITE_S3_BUCKET=knotty-photos
//
// AWS setup (one-time, ~5 minutes):
//   1. Go to https://s3.console.aws.amazon.com  →  Create bucket  →  name it "knotty-photos"
//      Under "Block Public Access" uncheck "Block all public access" so photos load in the app.
//   2. Go to https://console.aws.amazon.com/iam  →  Users  →  Create user
//      Attach this inline policy (restricts the key to ONLY this bucket):
//        {
//          "Version": "2012-10-17",
//          "Statement": [{
//            "Effect": "Allow",
//            "Action": ["s3:PutObject", "s3:GetObject"],
//            "Resource": "arn:aws:s3:::knotty-photos/photos/*"
//          }]
//        }
//   3. Create an Access Key for that user  →  copy Key ID + Secret into .env.local
//   4. On your S3 bucket  →  Permissions  →  CORS  →  paste:
//        [{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET","PUT"], "AllowedHeaders": ["*"] }]
//   5. Restart the dev server — S3 uploads activate automatically.
//
// FUTURE: replace the direct-key approach with Lambda + presigned URLs when
// you need to deploy publicly (see backend/upload-url/index.mjs).
// ─────────────────────────────────────────────────────────────────────────────

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const REGION     = import.meta.env.VITE_AWS_REGION             as string | undefined
const ACCESS_KEY = import.meta.env.VITE_AWS_ACCESS_KEY_ID      as string | undefined
const SECRET_KEY = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY  as string | undefined
const BUCKET     = import.meta.env.VITE_S3_BUCKET              as string | undefined

const s3Enabled = !!(REGION && ACCESS_KEY && SECRET_KEY && BUCKET)

// Lazily created — only instantiated when S3 keys are present
const s3 = s3Enabled
  ? new S3Client({
      region: REGION!,
      credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
    })
  : null

const RESIZE_PX    = 128
const JPEG_QUALITY = 0.82

/**
 * Upload a photo for a contact and return the URL to store in node.photo.
 *
 * @param file      - File object from <input type="file">
 * @param contactId - Used as the S3 key: photos/{contactId}.jpg
 */
export async function uploadPhoto(file: File, contactId?: string): Promise<string> {
  if (s3 && BUCKET) {
    return uploadToS3(file, contactId)
  }
  return resizeToBase64(file, RESIZE_PX, JPEG_QUALITY)
}

// ── S3 path ───────────────────────────────────────────────────────────────────

async function uploadToS3(file: File, contactId?: string): Promise<string> {
  const key = `photos/${contactId ?? Date.now()}.jpg`

  // 1. Sign the request locally (pure JS — no network call, no CORS issue)
  const command    = new PutObjectCommand({ Bucket: BUCKET!, Key: key, ContentType: 'image/jpeg' })
  const signedUrl  = await getSignedUrl(s3!, command, { expiresIn: 120 })
  console.log('[upload] presigned URL →', signedUrl)

  // 2. Resize image locally
  const base64 = await resizeToBase64(file, RESIZE_PX, JPEG_QUALITY)
  const bytes  = base64ToUint8Array(base64)

  // 3. PUT directly to S3 with the signed URL — simple fetch, no SDK overhead
  const res = await fetch(signedUrl, {
    method:  'PUT',
    body:    bytes.buffer as ArrayBuffer,
    headers: { 'Content-Type': 'image/jpeg' },
  })
  if (!res.ok) throw new Error(`S3 responded ${res.status}: ${await res.text()}`)

  // ?t= busts the browser cache so re-uploads show immediately
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}?t=${Date.now()}`
}

// ── Local fallback ────────────────────────────────────────────────────────────

function resizeToBase64(file: File, size: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img       = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const canvas = document.createElement('canvas')
      canvas.width  = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }

      // Centre-crop: take the largest square from the middle
      const srcSize = Math.min(img.naturalWidth, img.naturalHeight)
      const sx      = (img.naturalWidth  - srcSize) / 2
      const sy      = (img.naturalHeight - srcSize) / 2
      ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size)

      resolve(canvas.toDataURL('image/jpeg', quality))
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    img.src = objectUrl
  })
}

function base64ToUint8Array(dataUrl: string): Uint8Array {
  const byteString = atob(dataUrl.split(',')[1])
  const buf = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) buf[i] = byteString.charCodeAt(i)
  return buf
}
