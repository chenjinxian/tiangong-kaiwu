/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Webhook Signature Validator
 *
 * Validates HMAC-SHA256 signatures from iTwin Platform webhooks.
 * Reference: webhooks-api-samples/webhooks-api-v2-sample-nodejs-express-app
 */

import crypto from 'crypto';
import { logger } from './utils/logger.js';

/**
 * Signature validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate webhook signature using HMAC-SHA256
 *
 * @param secret - Webhook secret from iTwin Platform
 * @param payload - Raw request body (as received)
 * @param signatureHeader - Signature header from request (format: "sha256=<hex>")
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateSignature(
 *   'my-webhook-secret',
 *   '{"eventType":"iModels.iModelDeleted.v1",...}',
 *   'sha256=a24a2e58912f4708f21eb043def1b1bcc0684b81a2e3feebe04ca558ff9830ce'
 * );
 * if (result.valid) { // process event }
 * ```
 */
export function validateSignature(
  secret: string,
  payload: string | Buffer,
  signatureHeader: string
): ValidationResult {
  if (!secret) {
    return { valid: false, error: 'Webhook secret not configured' };
  }

  if (!signatureHeader) {
    return { valid: false, error: 'Missing signature header' };
  }

  if (!payload) {
    return { valid: false, error: 'Missing request body' };
  }

  // Convert Buffer/Object to string if necessary
  let payloadString: string;
  if (Buffer.isBuffer(payload)) {
    payloadString = payload.toString('utf-8');
  } else if (typeof payload === 'string') {
    payloadString = payload;
  } else if (typeof payload === 'object' && payload !== null) {
    // If somehow an object was passed, stringify it
    payloadString = JSON.stringify(payload);
  } else {
    return { valid: false, error: 'Invalid payload type' };
  }

  // Parse signature header (format: "sha256=<hex>")
  const separatorIndex = signatureHeader.indexOf('=');
  if (separatorIndex === -1) {
    return { valid: false, error: 'Invalid signature header format' };
  }

  const algorithm = signatureHeader.substring(0, separatorIndex);
  const signature = signatureHeader.substring(separatorIndex + 1);

  if (algorithm.toLowerCase() !== 'sha256') {
    return { valid: false, error: `Unsupported algorithm: ${algorithm}` };
  }

  // Generate HMAC-SHA256 signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadString, 'utf-8')
    .digest('hex');

  // Compare signatures using timing-safe comparison
  try {
    const signatureBuffer = Buffer.from(signature.toLowerCase(), 'hex');
    const expectedBuffer = Buffer.from(expectedSignature.toLowerCase(), 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'Signature mismatch' };
    }

    const match = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!match) {
      return { valid: false, error: 'Signature mismatch' };
    }

    return { valid: true };
  } catch (error) {
    // Fail closed, but never silently: every expected format failure (missing
    // '=', non-sha256 algorithm, length mismatch) is already rejected
    // explicitly above, so anything reaching this handler is unexpected —
    // surface its reason instead of swallowing it. Returning false (not
    // rethrowing) keeps malformed input a 401 in the async express route
    // rather than an unhandled rejection.
    logger.warn('signature parse failed', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return { valid: false, error: 'Invalid signature format' };
  }
}

/**
 * Extract and validate signature from request headers
 *
 * @param secret - Webhook secret
 * @param headers - Request headers object
 * @param rawBody - Raw request body
 * @returns Validation result
 */
export function validateRequest(
  secret: string,
  headers: Record<string, string | string[] | undefined>,
  rawBody: string | Buffer
): ValidationResult {
  // iTwin Platform sends signature in 'signature' header
  const signatureHeader = headers.signature || headers.Signature;

  if (!signatureHeader) {
    return { valid: false, error: 'Missing signature header' };
  }

  // Handle array case
  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;

  return validateSignature(secret, rawBody, signature);
}
