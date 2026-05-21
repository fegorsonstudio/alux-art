import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = { title: "Privacy Policy — Alux Art" };

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
        <Link href="/marketplace" className={styles.navLink}>Browse styles</Link>
      </nav>

      <div className={styles.content}>
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.effectiveDate}>Effective date: 21 May 2026</p>

        <div className={styles.prose}>
          <h2>1. Who We Are</h2>
          <p>
            Alux Art and Frames ("Alux Art", "we", "us") operates the Virtual Photo Studio at
            aluxartandframes.shop. This Privacy Policy explains what personal data we collect,
            why we collect it, and how we protect it.
          </p>
          <p>
            <strong>Data Controller:</strong> Alux Art and Frames, Nigeria.<br />
            <strong>Contact:</strong>{" "}
            <a href="mailto:fegorsonphotography@gmail.com">fegorsonphotography@gmail.com</a>
          </p>

          <h2>2. Data We Collect</h2>
          <p>
            <strong>Account data:</strong> Your email address, display name (if provided), and
            authentication credentials when you register.
          </p>
          <p>
            <strong>Identity photos:</strong> When you create a shoot, you upload photos of your
            face and body. These are used by our AI system to generate your portraits. Because
            these photos contain biometric information, we treat them with the highest level
            of care and restrict their use strictly to your shoot.
          </p>
          <p>
            <strong>Transaction data:</strong> Purchase history, template identifiers,
            Paystack transaction references, and shoot credits.
          </p>
          <p>
            <strong>Creator data:</strong> If you register as a Creator, we collect your bank
            account details (account number, bank name, and account name) for payout purposes.
          </p>
          <p>
            <strong>Usage data:</strong> Pages visited, features used, and error logs for
            debugging purposes. We do not use third-party analytics or advertising trackers.
          </p>

          <h2>3. How We Use Your Data</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Email address</td>
                <td>Account management, purchase receipts, service notifications</td>
              </tr>
              <tr>
                <td>Identity photos</td>
                <td>AI portrait generation for your specific shoot only</td>
              </tr>
              <tr>
                <td>Transaction data</td>
                <td>Payment processing, dispute resolution, purchase history</td>
              </tr>
              <tr>
                <td>Creator bank details</td>
                <td>Paystack subaccount creation and payout settlements</td>
              </tr>
              <tr>
                <td>Usage data</td>
                <td>Debugging and improving the service</td>
              </tr>
            </tbody>
          </table>
          <p>
            We do not sell your data. We do not use your identity photos to train AI models.
            We do not run advertising on the Platform.
          </p>

          <h2>4. Identity Photos — Special Notice</h2>
          <p>
            Your identity photos (selfies and pose references you upload) receive the strongest
            protections we apply:
          </p>
          <ul>
            <li>Stored in Supabase secure storage, accessible only to you and our generation pipeline during your active shoot.</li>
            <li>Used solely to generate your requested portraits for that shoot.</li>
            <li>Not shared with third parties except the AI model that processes your generation request (fal.ai), which receives individual image URLs per request and does not retain them.</li>
            <li>Automatically and permanently deleted within 48 hours of shoot completion or expiry.</li>
          </ul>
          <p>
            We process your identity photos under the consent you give when you create a
            shoot. You may withdraw consent at any time by not submitting new shoots; existing
            photos will be deleted on their normal 48-hour cycle.
          </p>

          <h2>5. Sharing Your Data</h2>
          <p>We share data only where necessary to deliver the Service:</p>
          <p>
            <strong>Paystack:</strong> Processes all payments. Your payment card details are
            handled entirely by Paystack and are never stored on our servers. Their privacy
            policy governs payment data.
          </p>
          <p>
            <strong>fal.ai:</strong> AI model provider that processes your identity photos
            and generates portrait images. Images are sent per-request and are not retained
            by fal.ai beyond their standard processing window.
          </p>
          <p>
            <strong>Supabase:</strong> Hosts our database and file storage. Data is stored
            in secure, encrypted infrastructure. Supabase's privacy policy applies to
            infrastructure-level processing.
          </p>
          <p>
            We do not share your data with advertisers, data brokers, or any other
            third parties beyond those listed above.
          </p>

          <h2>6. Data Retention</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Retention Period</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account data</td>
                <td>Until you delete your account</td>
              </tr>
              <tr>
                <td>Identity photos</td>
                <td>48 hours after shoot completion or expiry</td>
              </tr>
              <tr>
                <td>Generated portraits</td>
                <td>48 hours after shoot completion or expiry</td>
              </tr>
              <tr>
                <td>Transaction records</td>
                <td>7 years (tax and legal compliance)</td>
              </tr>
              <tr>
                <td>Creator bank details</td>
                <td>Until the Creator removes them or closes their account</td>
              </tr>
            </tbody>
          </table>

          <h2>7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access</strong> the personal data we hold about you.</li>
            <li><strong>Correct</strong> inaccurate or incomplete data.</li>
            <li><strong>Delete</strong> your account and associated personal data.</li>
            <li><strong>Withdraw consent</strong> for processing of identity photos by not submitting new shoots.</li>
            <li><strong>Object</strong> to processing where we rely on legitimate interest.</li>
          </ul>
          <p>
            To exercise any of these rights, email us at{" "}
            <a href="mailto:fegorsonphotography@gmail.com">fegorsonphotography@gmail.com</a>.
            We will respond within 30 days.
          </p>

          <h2>8. Security</h2>
          <p>
            We use encrypted connections (HTTPS) for all data in transit, Supabase Row-Level
            Security to enforce access controls on our database, and server-side-only API
            keys that never reach the browser. We do not store payment card details — Paystack
            handles all card data in a PCI-compliant environment.
          </p>

          <h2>9. Cookies</h2>
          <p>
            We use only functional cookies required for authentication and session management.
            We do not use advertising, tracking, or third-party analytics cookies.
          </p>

          <h2>10. Children</h2>
          <p>
            The Platform is not intended for users under 18 years of age. We do not knowingly
            collect personal data from minors. If you believe a minor has provided us with
            personal data, please contact us and we will delete it promptly.
          </p>

          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we do, we will update
            the effective date at the top of this page. Your continued use of the Platform
            after changes are posted constitutes your acceptance of the revised Policy.
          </p>

          <h2>12. Contact</h2>
          <p>
            <strong>Alux Art and Frames</strong><br />
            Email: <a href="mailto:fegorsonphotography@gmail.com">fegorsonphotography@gmail.com</a><br />
            Website: aluxartandframes.shop
          </p>

          <div className={styles.siblingLinks}>
            <Link href="/terms" className={styles.siblingLink}>Terms of Service →</Link>
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
