// _shared/mailer.ts — Enzo Morais — RF20, RNF07 (Adendo 1, seção 7)
// MAIL_MODE=console (padrão): imprime no terminal. MAIL_MODE=smtp: Gmail com senha de aplicativo.
// O plano B (Brevo) não está implementado aqui; só entra se o SMTP falhar no Netlify.
import nodemailer from "nodemailer";

export type MailMessage = { to: string; subject: string; text: string };

export async function sendMail(message: MailMessage): Promise<void> {
  const mode = process.env.MAIL_MODE ?? "console";

  if (mode === "console") {
    if (process.env.CONTEXT === "production") throw new Error("SMTP_REQUIRED");
    console.log(
      `[MAIL:console] para=${message.to} assunto="${message.subject}"\n${message.text}`,
    );
    return;
  }
  if (mode !== "smtp") throw new Error("MAIL_MODE_INVALID");

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("MAIL_NOT_CONFIGURED");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    connectionTimeout: 8000,
    socketTimeout: 12000,
    auth: { user, pass },
  });

  const fromName = (process.env.MAIL_FROM_NAME ?? "Jhullymaison").replace(
    /["\r\n]/g,
    "",
  );
  await transporter.sendMail({
    from: `"${fromName}" <${user}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}
