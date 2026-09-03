/**
 * Depot des captures sur Cloudflare R2.
 *
 * R2 parle le protocole S3, d'ou le client standard. L'endpoint se construit a
 * partir de l'identifiant de compte : rien d'autre n'a besoin d'etre stocke.
 *
 * Les captures servent a la verification automatique puis sont supprimees ou
 * caviardees. Elles ne sont jamais publiees, et aucune n'est deposee pour une
 * course rejetee : inutile de conserver la preuve d'une soumission ecartee.
 */

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { endpointR2, juridictionValide } from "./r2-endpoint.ts";

/* R2 n'a pas de regions au sens S3 : la juridiction se choisit a la creation du
   bucket, et le client annonce « auto ». Ce n'est pas un reglage du projet. */
const REGION_R2 = "auto";

let client: S3Client | null = null;

export const stockageDisponible = (): boolean =>
  Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  );

const clientR2 = (): S3Client => {
  if (!stockageDisponible()) {
    throw new Error("Configuration R2 incomplete : aucune capture ne peut etre deposee.");
  }

  client ??= new S3Client({
    region: REGION_R2,
    endpoint: endpointR2(
      process.env.R2_ACCOUNT_ID as string,
      juridictionValide(process.env.R2_JURIDICTION)
    ),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  });

  return client;
};

export const deposerCapture = async (
  cle: string,
  donnees: Uint8Array,
  typeMime: string
): Promise<void> => {
  await clientR2().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: cle,
      Body: donnees,
      ContentType: typeMime,
    })
  );
};

export const supprimerCapture = async (cle: string): Promise<void> => {
  await clientR2().send(
    new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: cle })
  );
};
