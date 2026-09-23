// Values pasted into a hosting dashboard often carry a stray space or newline.
// An S3 secret with a trailing "\n" fails signing with an opaque "Unauthorized",
// so trim everything we read rather than trusting the paste.
const str = (name: string): string => (process.env[name] ?? "").trim();

export const ENV = {
  appId: str("VITE_APP_ID"),
  cookieSecret: str("JWT_SECRET"),
  /**
   * A senha das contas de teste em produção.
   *
   * Vazia — o padrão — mantém as contas de teste desligadas no ar. Definida,
   * elas voltam a funcionar, mas só com esta senha: nunca com "admin", que é o
   * que qualquer pessoa tenta primeiro.
   */
  senhaDasContasDeTeste: str("SENHA_CONTAS_TESTE"),
  databaseUrl: str("DATABASE_URL"),
  oAuthServerUrl: str("OAUTH_SERVER_URL"),
  ownerOpenId: str("OWNER_OPEN_ID"),
  isProduction: process.env.NODE_ENV === "production",
  s3Bucket: str("S3_BUCKET"),
  s3Region: str("S3_REGION") || "auto",
  s3Endpoint: str("S3_ENDPOINT"),
  s3AccessKeyId: str("S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: str("S3_SECRET_ACCESS_KEY"),
  s3ForcePathStyle: str("S3_FORCE_PATH_STYLE") === "true",
  resendApiKey: str("RESEND_API_KEY"),
  mailFrom: str("MAIL_FROM"),
  appUrl: str("APP_URL").replace(/\/+$/, ""),
};
