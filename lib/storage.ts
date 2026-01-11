import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageUploadResult {
  key: string;
  url: string;
}

export interface StorageProvider {
  uploadFile(params: {
    data: Buffer;
    contentType: string;
    keyPrefix: string;
    originalName: string;
  }): Promise<StorageUploadResult>;
}

const buildPublicUrl = (key: string) => {
  const base = process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/+$/, "");
  if (!base) return `/${key}`;
  return `${base}/${key}`;
};

class LocalStorageProvider implements StorageProvider {
  async uploadFile({
    data,
    contentType,
    keyPrefix,
    originalName,
  }: {
    data: Buffer;
    contentType: string;
    keyPrefix: string;
    originalName: string;
  }): Promise<StorageUploadResult> {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const key = `${keyPrefix}/${randomUUID()}-${safeName}`;
    const fullPath = path.join(process.cwd(), "public", key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    return {
      key,
      url: buildPublicUrl(key),
    };
  }
}

class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private region: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    this.bucket = process.env.S3_BUCKET || "";
    this.region = process.env.S3_REGION || "us-east-1";
    this.client = new S3Client({
      region: this.region,
      endpoint,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
      forcePathStyle: Boolean(endpoint),
    });
  }

  async uploadFile({
    data,
    contentType,
    keyPrefix,
    originalName,
  }: {
    data: Buffer;
    contentType: string;
    keyPrefix: string;
    originalName: string;
  }): Promise<StorageUploadResult> {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const key = `${keyPrefix}/${randomUUID()}-${safeName}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
    const url = process.env.PUBLIC_ASSET_BASE_URL
      ? buildPublicUrl(key)
      : await getSignedUrl(
          this.client,
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
          { expiresIn: 3600 },
        );
    return { key, url };
  }
}

export function getStorageProvider(): StorageProvider {
  if (process.env.STORAGE_PROVIDER === "s3") {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}
