import { Resend } from 'resend';
import { env } from '../config/env';
import { escapeHtml } from '../utils/helpers';

const FROM_ADDRESS = process.env.NODE_ENV === 'production'
  ? 'PeerLink <noreply@yourdomain.com>'   // Change this to your verified domain
  : 'PeerLink <onboarding@resend.dev>';   // Sandbox for dev (must add recipient to verified list)

class EmailService {
  private client: Resend | null = null;

  private getClient(): Resend {
    if (!this.client) {
      this.client = new Resend(env.RESEND_API_KEY);
    }
    return this.client;
  }

  async sendVerificationEmail(to: string, name: string, userId: string, token: string): Promise<void> {
    const verificationUrl = `${env.CLIENT_URL}/verify-email?userId=${userId}&token=${token}`;
    const safeName = escapeHtml(name);

    try {
      await this.getClient().emails.send({
        from: FROM_ADDRESS,
        to,
        subject: 'Verify your email address',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
              .container { max-width: 480px; margin: 40px auto; padding: 32px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
              .logo { font-size: 24px; font-weight: 700; color: #1a73e8; margin-bottom: 24px; }
              h1 { font-size: 20px; color: #1f2937; margin: 0 0 8px; }
              p { color: #6b7280; line-height: 1.6; margin: 0 0 24px; }
              .button { display: inline-block; padding: 12px 32px; background-color: #1a73e8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
              .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">PeerLink</div>
              <h1>Welcome, ${safeName}!</h1>
              <p>Please verify your email address to start using PeerLink. This link expires in 24 hours.</p>
              <a href="${verificationUrl}" class="button">Verify Email</a>
              <div class="footer">
                <p>If you did not create this account, you can safely ignore this email.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
    } catch (error) {
      console.error('Failed to send verification email:', error);
    }
  }

  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;
    const safeName = escapeHtml(name);

    try {
      await this.getClient().emails.send({
        from: FROM_ADDRESS,
        to,
        subject: 'Reset your password',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
              .container { max-width: 480px; margin: 40px auto; padding: 32px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
              .logo { font-size: 24px; font-weight: 700; color: #1a73e8; margin-bottom: 24px; }
              h1 { font-size: 20px; color: #1f2937; margin: 0 0 8px; }
              p { color: #6b7280; line-height: 1.6; margin: 0 0 24px; }
              .button { display: inline-block; padding: 12px 32px; background-color: #1a73e8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
              .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">PeerLink</div>
              <h1>Password Reset Request</h1>
              <p>Hi ${safeName}, we received a request to reset your password. This link expires in 1 hour.</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              <div class="footer">
                <p>If you did not request a password reset, you can safely ignore this email.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
    } catch (error) {
      console.error('Failed to send password reset email:', error);
    }
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    const safeName = escapeHtml(name);
    try {
      await this.getClient().emails.send({
        from: FROM_ADDRESS,
        to,
        subject: 'Welcome to PeerLink!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
              .container { max-width: 480px; margin: 40px auto; padding: 32px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
              .logo { font-size: 24px; font-weight: 700; color: #1a73e8; margin-bottom: 24px; }
              h1 { font-size: 20px; color: #1f2937; margin: 0 0 8px; }
              p { color: #6b7280; line-height: 1.6; margin: 0 0 24px; }
              .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">PeerLink</div>
              <h1>Welcome to PeerLink, ${safeName}!</h1>
              <p>You're all set to start creating and joining video meetings. Get started by creating your first room.</p>
              <div class="footer">
                <p>If you did not create this account, please contact support.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  }
}

export const emailService = new EmailService();
