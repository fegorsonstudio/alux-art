import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = { title: "Terms of Service — Alux Art" };

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
        <Link href="/marketplace" className={styles.navLink}>Browse styles</Link>
      </nav>

      <div className={styles.content}>
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.effectiveDate}>Effective date: 21 May 2026</p>

        <div className={styles.prose}>
          <h2>1. Acceptance</h2>
          <p>
            By accessing or using Alux Art at aluxartandframes.shop (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;the Platform&rdquo;),
            you agree to these Terms of Service. If you do not agree, do not use the Platform.
          </p>

          <h2>2. The Service</h2>
          <p>
            Alux Art is an AI-powered portrait generation platform. You upload identity photos of
            yourself, select a shoot template created by a photographer, and receive AI-generated
            editorial portraits based on your likeness. Image generation is powered by third-party
            AI models and results are probabilistic — output quality may vary.
          </p>

          <h2>3. Eligibility</h2>
          <p>
            You must be at least 18 years old to use the Platform. By registering, you confirm
            that you meet this requirement.
          </p>

          <h2>4. Your Account</h2>
          <p>
            You are responsible for keeping your login credentials secure. You are responsible
            for all activity that occurs under your account. Notify us immediately if you
            suspect unauthorised access.
          </p>

          <h2>5. Identity Photos and Uploaded Content</h2>
          <p>
            <strong>You must only upload photos of yourself.</strong> Uploading photos of another
            person without their explicit written consent is strictly prohibited.
          </p>
          <p>
            By uploading photos to the Platform, you grant Alux Art a limited, non-exclusive,
            worldwide licence to process those photos solely to generate your requested portraits.
            We do not sell, share, or use your identity photos for any purpose beyond your shoot.
            Your uploaded photos are stored securely and permanently deleted within 48 hours of
            your shoot completing or expiring, whichever comes first.
          </p>

          <h2>6. Generated Images</h2>
          <p>
            AI-generated portraits produced from your identity photos are yours to use for personal
            and commercial purposes, subject to the following restrictions. You must not:
          </p>
          <ul>
            <li>Represent AI-generated images as photographs taken by a human photographer without disclosing that they are AI-generated.</li>
            <li>Use generated images to deceive, defame, harass, or harm any person.</li>
            <li>Use generated images in violation of any applicable law.</li>
            <li>Claim intellectual property rights over the underlying AI model outputs separate from the specific portrait of you.</li>
          </ul>

          <h2>7. Marketplace and Templates</h2>
          <p>
            The Platform hosts shoot templates created by independent photographer-creators
            (&ldquo;Creators&rdquo;). When you purchase a template, you are purchasing the right to use that
            Creator&apos;s style and direction for AI portrait generation in a single shoot.
          </p>
          <p>
            <strong>Refunds are not available once image generation begins.</strong> If a shoot
            fails entirely due to a platform error, we will issue a credit or re-run the shoot
            at our discretion.
          </p>

          <h2>8. Creator Terms</h2>
          <p>
            Access to the Creator programme requires submitting an application and receiving
            explicit written approval from Alux Art. Applying does not guarantee access.
            Approved Creator status may be suspended or revoked at any time for violations of
            these Terms, conduct harmful to customers or the Platform, or at Alux Art&apos;s sole
            discretion. Creators whose access is revoked will not be entitled to compensation
            for lost future earnings.
          </p>
          <p>Creators who are approved and list templates on the Platform further agree to:</p>
          <ul>
            <li>Only upload template images and content they own or have properly licensed.</li>
            <li>Not upload explicit, offensive, discriminatory, or otherwise unlawful content.</li>
            <li>Acknowledge that Alux Art retains a platform fee on each transaction processed through their template.</li>
            <li>Provide accurate bank account details for payouts. Alux Art is not responsible for failed settlements caused by incorrect bank information.</li>
          </ul>

          <h2>8a. WhatsApp Business Integration</h2>
          <p>
            Approved Creators may optionally connect their WhatsApp Business Cloud API account
            to enable automated booking conversations (&ldquo;WhatsApp Bot&rdquo;) on their behalf.
            By connecting their account, Creators:
          </p>
          <ul>
            <li>Consent to Alux Art processing customer messages received on their WhatsApp
              Business number for the sole purpose of facilitating template bookings.</li>
            <li>Confirm they hold a valid WhatsApp Business Cloud API account and comply with
              Meta&apos;s Messaging Policies and WhatsApp Business Policy.</li>
            <li>Acknowledge that Alux Art acts as a processor of customer messages on their
              behalf, and Creators bear responsibility for ensuring their use of the
              WhatsApp integration complies with applicable laws and Meta&apos;s policies.</li>
            <li>Agree that disconnecting the WhatsApp integration will immediately stop
              message processing. Residual session data will be deleted within 24 hours.</li>
          </ul>

          <h2>9. Payments</h2>
          <p>
            Payments are processed by Paystack. By making a purchase, you also agree to
            Paystack&apos;s terms of service. Prices are listed in Nigerian Naira (₦) unless
            otherwise stated. All purchases are final once generation begins.
          </p>

          <h2>10. Prohibited Conduct</h2>
          <p>You must not:</p>
          <ul>
            <li>Attempt to reverse-engineer, scrape, or disrupt the Platform or its underlying AI systems.</li>
            <li>Upload images of other people without their consent.</li>
            <li>Use the Platform for any illegal purpose.</li>
            <li>Attempt to bypass payment, credit, or access control systems.</li>
            <li>Impersonate any person or entity.</li>
            <li>Upload content that infringes third-party intellectual property rights.</li>
          </ul>

          <h2>11. Disclaimers</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; We do not guarantee that every
            generated image will meet your expectations. AI image generation is probabilistic
            and results vary by input quality, template complexity, and model behaviour. We make
            no warranty that the Platform will be uninterrupted, error-free, or available at
            any particular time.
          </p>

          <h2>12. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by applicable law, Alux Art&apos;s total liability
            for any claim arising from your use of the Platform is limited to the amount you
            paid for the specific shoot giving rise to the claim. We are not liable for
            indirect, incidental, consequential, or punitive damages of any kind.
          </p>

          <h2>13. Intellectual Property</h2>
          <p>
            The Platform, its design, code, templates, and branding are owned by Alux Art and
            protected by applicable intellectual property laws. You may not copy, reproduce,
            or distribute any part of the Platform without our written permission.
          </p>

          <h2>14. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your account at our discretion if
            you violate these Terms or engage in conduct that harms the Platform or its users.
            You may delete your account at any time by contacting us.
          </p>

          <h2>15. Governing Law</h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of the
            Federal Republic of Nigeria. Any disputes shall be subject to the exclusive
            jurisdiction of the courts of Nigeria.
          </p>

          <h2>16. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. When we do, we will update the
            effective date above. Your continued use of the Platform after changes are
            posted constitutes your acceptance of the revised Terms.
          </p>

          <h2>17. Contact</h2>
          <p>
            <strong>Alux Art and Frames</strong><br />
            Email: <a href="mailto:aluxartandframes@gmail.com">aluxartandframes@gmail.com</a><br />
            Website: aluxartandframes.shop
          </p>

          <div className={styles.siblingLinks}>
            <Link href="/privacy" className={styles.siblingLink}>Privacy Policy →</Link>
            <Link href="/" className={styles.siblingLink}>← Back to Home</Link>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>Alux Art</span>
        <span className={styles.footerNote}>© 2026 Alux Art and Frames. All rights reserved.</span>
      </footer>
    </div>
  );
}
