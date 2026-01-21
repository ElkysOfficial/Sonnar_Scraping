import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Image dimensions
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const TWITTER_WIDTH = 1200;
const TWITTER_HEIGHT = 600;

// Colors
const COLORS = {
  background: '#FFFFFF',
  accent: '#2563EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  surface: '#F3F4F6'
};

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawLeftContent(ctx, offsetX, isTwitter = false) {
  const logoY = isTwitter ? 70 : 80;
  const headlineY = isTwitter ? 200 : 220;
  const headlineY2 = isTwitter ? 260 : 285;
  const subY1 = isTwitter ? 320 : 350;
  const subY2 = isTwitter ? 346 : 378;
  const subY3 = isTwitter ? 372 : 406;
  const ctaY = isTwitter ? 410 : 450;
  const proofY = isTwitter ? 500 : 540;
  const urlY = isTwitter ? 555 : 590;
  const fontSize = {
    logo: isTwitter ? 22 : 24,
    headline: isTwitter ? 48 : 52,
    sub: isTwitter ? 18 : 20,
    cta: isTwitter ? 15 : 16,
    proof: isTwitter ? 14 : 15,
    url: isTwitter ? 15 : 16
  };

  // Logo box
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, offsetX, logoY, isTwitter ? 44 : 48, isTwitter ? 44 : 48, isTwitter ? 9 : 10);
  ctx.fill();

  // Logo letter
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${fontSize.logo}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('S', offsetX + (isTwitter ? 22 : 24), logoY + (isTwitter ? 30 : 32));

  // Logo text
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `bold ${fontSize.logo}px Arial`;
  ctx.textAlign = 'left';
  ctx.fillText('Sonnar', offsetX + (isTwitter ? 60 : 64), logoY + (isTwitter ? 30 : 34));

  // Main headline
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `800 ${fontSize.headline}px Arial`;
  ctx.fillText('Vagas do seu stack.', offsetX, headlineY);
  ctx.fillText('Direto no WhatsApp.', offsetX, headlineY2);

  // Subheadline
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = `${fontSize.sub}px Arial`;
  ctx.fillText('Monitoramos 16+ fontes e enviamos', offsetX, subY1);
  ctx.fillText('apenas vagas relevantes para o seu perfil.', offsetX, subY2);
  ctx.fillText('Sem duplicatas, sem ruído.', offsetX, subY3);

  // CTA button
  const ctaWidth = isTwitter ? 170 : 180;
  const ctaHeight = isTwitter ? 42 : 44;
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, offsetX, ctaY, ctaWidth, ctaHeight, ctaHeight / 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${fontSize.cta}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('Começar agora', offsetX + ctaWidth / 2, ctaY + (isTwitter ? 27 : 29));
  ctx.textAlign = 'left';

  // Social proof
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `${fontSize.proof}px Arial`;
  ctx.fillText('1.247 devs recebendo vagas esta semana', offsetX, proofY);

  // URL
  ctx.font = `${fontSize.url}px Arial`;
  ctx.fillText('sonnar.com.br', offsetX, urlY);
}

function drawGrid(ctx, width, height) {
  ctx.strokeStyle = COLORS.surface;
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawDecorations(ctx, width, height) {
  // Top right accent
  ctx.fillStyle = 'rgba(37, 99, 235, 0.03)';
  ctx.beginPath();
  ctx.arc(width - 50, 50, 150, 0, Math.PI * 2);
  ctx.fill();

  // Bottom left accent
  ctx.fillStyle = 'rgba(37, 211, 102, 0.03)';
  ctx.beginPath();
  ctx.arc(50, height - 50, 100, 0, Math.PI * 2);
  ctx.fill();
}

async function createOGImage(phoneImage) {
  const canvas = createCanvas(OG_WIDTH, OG_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  // Grid
  drawGrid(ctx, OG_WIDTH, OG_HEIGHT);

  // Decorations
  drawDecorations(ctx, OG_WIDTH, OG_HEIGHT);

  // Left content
  drawLeftContent(ctx, 80, false);

  // Draw phone image from Telefone.png
  // Original image dimensions (approximate from the screenshot)
  const phoneOriginalWidth = phoneImage.width;
  const phoneOriginalHeight = phoneImage.height;

  // Scale to fit height (630 - 60 margins = 570px available)
  const targetHeight = 570;
  const scale = targetHeight / phoneOriginalHeight;
  const targetWidth = phoneOriginalWidth * scale;

  // Position on the right side
  const phoneX = OG_WIDTH - targetWidth - 60;
  const phoneY = (OG_HEIGHT - targetHeight) / 2;

  ctx.drawImage(phoneImage, phoneX, phoneY, targetWidth, targetHeight);

  return canvas;
}

async function createTwitterCard(phoneImage) {
  const canvas = createCanvas(TWITTER_WIDTH, TWITTER_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, TWITTER_WIDTH, TWITTER_HEIGHT);

  // Grid
  drawGrid(ctx, TWITTER_WIDTH, TWITTER_HEIGHT);

  // Decorations
  drawDecorations(ctx, TWITTER_WIDTH, TWITTER_HEIGHT);

  // Left content
  drawLeftContent(ctx, 80, true);

  // Draw phone image from Telefone.png
  const phoneOriginalWidth = phoneImage.width;
  const phoneOriginalHeight = phoneImage.height;

  // Scale to fit height (600 - 60 margins = 540px available)
  const targetHeight = 540;
  const scale = targetHeight / phoneOriginalHeight;
  const targetWidth = phoneOriginalWidth * scale;

  // Position on the right side
  const phoneX = TWITTER_WIDTH - targetWidth - 60;
  const phoneY = (TWITTER_HEIGHT - targetHeight) / 2;

  ctx.drawImage(phoneImage, phoneX, phoneY, targetWidth, targetHeight);

  return canvas;
}

async function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  const phonePath = path.join(publicDir, 'Telefone.png');

  console.log('Loading phone image...');
  const phoneImage = await loadImage(phonePath);
  console.log(`Phone image loaded: ${phoneImage.width}x${phoneImage.height}`);

  console.log('Generating og-image.jpg...');
  const ogCanvas = await createOGImage(phoneImage);
  const ogBuffer = ogCanvas.toBuffer('image/jpeg', { quality: 0.95 });
  fs.writeFileSync(path.join(publicDir, 'og-image.jpg'), ogBuffer);
  console.log('Created: public/og-image.jpg');

  console.log('Generating twitter-card.jpg...');
  const twitterCanvas = await createTwitterCard(phoneImage);
  const twitterBuffer = twitterCanvas.toBuffer('image/jpeg', { quality: 0.95 });
  fs.writeFileSync(path.join(publicDir, 'twitter-card.jpg'), twitterBuffer);
  console.log('Created: public/twitter-card.jpg');

  console.log('Done!');
}

main().catch(console.error);
