// Sonnar email template - estrutura inspirada em email-preview3.html
// Paleta adaptada ao Design System Sonnar v2.0:
//   --color-accent:        #2563EB
//   --color-accent-hover:  #1D4ED8
//   gradient companion:    #7C3AED  (faixa superior do card)
// Mantém compatibilidade ampla com clientes de email (tables + inline styles + VML para Outlook).

export interface EmailCredential {
  label: string;
  value: string;
  highlight?: boolean; // destaca em azul (ex: e-mail)
}

export interface SonnarEmailOptions {
  preheader: string;
  greeting: string;            // ex: "Boa tarde, João Silva."
  intro: string;               // parágrafo de abertura
  credentials?: EmailCredential[];
  otpCode?: { label?: string; value: string }; // bloco centralizado com código
  cta?: { label: string; href: string };
  postCta?: string;            // parágrafo após o botão
  footnotes?: string[];        // parágrafos italicos finais
  signOff?: string;            // ex: "Atenciosamente,"
  signature?: string;          // ex: "Equipe Sonnar"
}

const BRAND = "#2563EB";
const BRAND_DARK = "#1D4ED8";
const ACCENT = "#1D4ED8";
const BG = "#f3f4f6";
const TEXT_DARK = "#111827";
const TEXT_BODY = "#374151";
const TEXT_MUTED = "#6B7280";
const HIGHLIGHT = "#2563EB";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCredentials(rows: EmailCredential[]): string {
  return rows
    .map((row) => {
      const valueColor = row.highlight ? HIGHLIGHT : TEXT_DARK;
      return `
        <tr class="stack-column">
          <td class="credential-label text-muted" valign="top"
              style="width:145px;padding:0 10px 10px 0;font-size:13px;line-height:20px;color:${TEXT_MUTED};">
            ${esc(row.label)}
          </td>
          <td class="text-dark" valign="top"
              style="padding:0 0 10px 0;font-size:13px;line-height:20px;color:${valueColor};font-weight:700;">
            ${esc(row.value)}
          </td>
        </tr>`;
    })
    .join("");
}

function renderOtpBlock(otp: { label?: string; value: string }): string {
  const label = esc(otp.label ?? "Seu código de verificação");
  // Insere espaço entre cada caractere para reforçar visualmente o agrupamento
  // dos dígitos (mesmo padrão usado no email referência).
  const spaced = esc(otp.value.split("").join(" "));
  return `
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 22px 0;">
      <tr>
        <td align="center"
            style="padding:18px 12px;background-color:#F7F7F7;border:1px solid #DDDDDD;border-radius:8px;">
          <p class="text-muted"
             style="margin:0 0 6px 0;font-size:11px;line-height:14px;color:#7C8796;text-transform:uppercase;letter-spacing:1.5px;">
            ${label}
          </p>
          <p class="text-dark"
             style="margin:0;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:38px;font-weight:700;color:#0B0E11;letter-spacing:8px;">
            ${spaced}
          </p>
        </td>
      </tr>
    </table>`;
}

function renderCta(cta: { label: string; href: string }): string {
  const href = esc(cta.href);
  const label = esc(cta.label);
  return `
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}"
            style="height:42px;v-text-anchor:middle;width:200px;" arcsize="14%"
            strokecolor="${BRAND}" fillcolor="${BRAND}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">
              ${label}
            </center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${href}" target="_blank" class="button button-brand"
             style="display:inline-block;background-color:${BRAND};color:#ffffff;font-size:14px;line-height:14px;
                    font-weight:700;padding:14px 28px;border-radius:6px;">
            ${label}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>`;
}

export function renderSonnarEmail(opts: SonnarEmailOptions): string {
  const credentialsBlock = opts.credentials?.length
    ? `
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
             style="width:100%;background-color:#f7f7f7;border:1px solid #dddddd;margin:0 0 22px 0;">
        <tr>
          <td style="padding:14px;">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
              ${renderCredentials(opts.credentials)}
            </table>
          </td>
        </tr>
      </table>`
    : "";

  const otpBlock = opts.otpCode ? renderOtpBlock(opts.otpCode) : "";

  const ctaBlock = opts.cta ? renderCta(opts.cta) : "";

  const postCtaBlock = opts.postCta
    ? `<p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:${TEXT_BODY};">${esc(opts.postCta)}</p>`
    : "";

  const signOffBlock = opts.signOff
    ? `<p class="text-body" style="margin:0 0 6px 0;font-size:14px;line-height:22px;color:${TEXT_BODY};">${esc(opts.signOff)}</p>`
    : "";

  const signatureBlock = opts.signature
    ? `<p class="text-dark" style="margin:0 0 24px 0;font-size:14px;line-height:22px;color:${TEXT_DARK};font-weight:700;">${esc(opts.signature)}</p>`
    : "";

  const footnotesBlock = (opts.footnotes ?? [])
    .map(
      (n, i, arr) =>
        `<p class="text-muted" style="margin:0 0 ${i === arr.length - 1 ? "0" : "12px"} 0;font-size:11px;line-height:18px;color:${TEXT_MUTED};font-style:italic;">${esc(n)}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>Sonnar</title>
    <style>
      html, body { margin:0 !important; padding:0 !important; width:100% !important; height:100% !important; background-color:${BG} !important; }
      body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif; }
      table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse !important; }
      img { border:0; outline:none; text-decoration:none; display:block; -ms-interpolation-mode:bicubic; }
      a { text-decoration:none; }
      @media only screen and (max-width: 600px) {
        .container { width:100% !important; max-width:100% !important; }
        .mobile-side-padding { padding-left:16px !important; padding-right:16px !important; }
        .mobile-content-padding { padding:20px 16px 24px 16px !important; }
        .stack-column, .stack-column td { display:block !important; width:100% !important; }
        .credential-label { padding-bottom:4px !important; }
        .button { display:block !important; width:100% !important; box-sizing:border-box !important; }
      }
      [data-ogsc] .email-bg, [data-ogsb] .email-bg { background-color:${BG} !important; }
      [data-ogsc] .card-bg, [data-ogsb] .card-bg { background-color:#ffffff !important; }
      [data-ogsc] .brand-bg, [data-ogsb] .brand-bg { background-color:${BRAND} !important; }
      [data-ogsc] .text-dark, [data-ogsb] .text-dark { color:${TEXT_DARK} !important; }
      [data-ogsc] .text-body, [data-ogsb] .text-body { color:${TEXT_BODY} !important; }
      [data-ogsc] .text-muted, [data-ogsb] .text-muted { color:${TEXT_MUTED} !important; }
      [data-ogsc] .button-brand, [data-ogsb] .button-brand { background-color:${BRAND} !important; color:#ffffff !important; }
    </style>
  </head>
  <body class="email-bg" style="margin:0;padding:0;background-color:${BG};">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG};opacity:0;">
      ${esc(opts.preheader)}
    </div>
    <div style="display:none;max-height:0;overflow:hidden;">
      &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>
    <center style="width:100%;background-color:${BG};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="email-bg" style="background-color:${BG};">
        <tr>
          <td align="center" valign="top" style="background-color:${BG};">

            <!-- HEADER -->
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="brand-bg"
                   style="background-color:${BRAND};">
              <tr>
                <td align="center" style="padding:28px 16px 0 16px;">
                  <table role="presentation" width="552" border="0" cellspacing="0" cellpadding="0" class="container"
                         style="width:552px;max-width:552px;">
                    <tr>
                      <td align="left" style="padding:0 0 28px 16px;">
                        <span style="display:inline-block;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                                     font-size:22px;line-height:22px;font-weight:700;letter-spacing:0.04em;color:#ffffff;">
                          SONNAR
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td height="5" style="height:5px;line-height:5px;font-size:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- TRANSIÇÃO HEADER + CARD -->
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${BG};">
              <tr>
                <td align="center" valign="top" class="mobile-side-padding"
                    style="padding:0 16px;background:linear-gradient(to bottom, ${BRAND} 0, ${BRAND} 58px, ${BG} 58px, ${BG} 100%);">
                  <table role="presentation" width="552" border="0" cellspacing="0" cellpadding="0" class="container card-bg"
                         style="width:552px;max-width:552px;background-color:#ffffff;border-top:3px solid ${ACCENT};">
                    <tr>
                      <td class="mobile-content-padding" style="padding:24px 24px 0 24px;background-color:#ffffff;">
                        <p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:${TEXT_BODY};">
                          ${esc(opts.greeting)}
                        </p>
                        <p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:${TEXT_BODY};">
                          ${esc(opts.intro)}
                        </p>

                        ${credentialsBlock}
                        ${otpBlock}
                        ${ctaBlock}
                        ${postCtaBlock}
                        ${signOffBlock}
                        ${signatureBlock}
                        ${footnotesBlock}
                      </td>
                    </tr>
                    <tr>
                      <td style="height:14px;line-height:14px;font-size:0;background-color:#ffffff;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- TRANSIÇÃO FOOTER -->
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="brand-bg" style="background-color:${BRAND};">
              <tr>
                <td align="center" valign="top" class="mobile-side-padding" style="padding:0 16px;background-color:${BRAND};">
                  <table role="presentation" width="552" border="0" cellspacing="0" cellpadding="0" class="container" style="width:552px;max-width:552px;">
                    <tr>
                      <td style="height:44px;line-height:14px;font-size:0;background-color:#ffffff;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" valign="top" style="padding:18px 16px 24px 16px;background-color:${BRAND};">
                  <table role="presentation" width="552" border="0" cellspacing="0" cellpadding="0" class="container" style="width:552px;max-width:552px;">
                    <tr>
                      <td align="center" style="font-size:12px;line-height:18px;color:#ffffff;opacity:0.9;
                                                font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                        Sonnar · Vagas de TI personalizadas<br/>
                        <a href="https://sonnarjobs.com.br" style="color:#ffffff;text-decoration:underline;">sonnarjobs.com.br</a>
                        &nbsp;·&nbsp;
                        <a href="mailto:contato@sonnarjobs.com.br" style="color:#ffffff;text-decoration:underline;">contato@sonnarjobs.com.br</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </center>
  </body>
</html>`;
}
