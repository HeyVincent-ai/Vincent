import PageShell from '../components/PageShell';

export default function Terms() {
  return (
    <PageShell active="home">
      <style>{`
        .terms-page { padding: 8rem 0 4rem; }
        .terms-page .container-narrow { max-width: 800px; margin: 0 auto; padding: 0 1.5rem; }
        .terms-page h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .terms-page .terms-updated { color: var(--text-muted); font-size: 0.9375rem; margin-bottom: 3rem; }
        .terms-page h2 { font-size: 1.5rem; margin-top: 2.5rem; margin-bottom: 1rem; }
        .terms-page h3 { font-size: 1.125rem; margin-top: 2rem; margin-bottom: 0.75rem; }
        .terms-page p { font-size: 0.9375rem; line-height: 1.8; margin-bottom: 1rem; color: var(--text-muted); }
        .terms-page ul, .terms-page ol { margin-bottom: 1rem; padding-left: 1.5rem; }
        .terms-page li { font-size: 0.9375rem; line-height: 1.8; color: var(--text-muted); margin-bottom: 0.5rem; list-style: disc; }
        .terms-page strong { color: var(--text); }
        .terms-page a { color: var(--accent); }
        .terms-page a:hover { text-decoration: underline; }
        .terms-page .terms-quote {
          border-left: 3px solid var(--accent); padding: 1rem 1.5rem; margin: 1.5rem 0;
          background: rgba(139,92,246,0.04); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          font-style: italic;
        }
        .terms-page .terms-quote p { margin-bottom: 0; }
        .terms-page hr { border: none; border-top: 1px solid var(--border); margin: 3rem 0; }
      `}</style>
      <div className="terms-page">
        <div className="container-narrow">
          <h1>Terms of Service</h1>
          <p className="terms-updated">Last Updated: February 13, 2026</p>

          <p>
            Workgraph, Inc. and its affiliates (&quot;Vincent,&quot; &quot;we,&quot; &quot;us,&quot;
            or &quot;our&quot;) operate heyvincent.ai (the &quot;Website&quot;) and provide
            cloud-hosted infrastructure, APIs, and related services (collectively, the
            &quot;Services&quot;). These Terms of Service (&quot;Terms&quot;) constitute a binding
            agreement between you (&quot;User,&quot; &quot;you,&quot; or &quot;your&quot;) and
            Vincent governing your rental and use of our Services.
          </p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing the Website, creating an Account, or using any part of the Services, you
            acknowledge that you have read, understood, and agree to be bound by these Terms and our
            Privacy Policy (collectively, the &quot;Agreement&quot;). If you do not agree to these
            Terms, you must not access or use the Services.
          </p>
          <p>
            If you are entering into these Terms on behalf of an organization, you represent and
            warrant that you have the authority to bind that organization to these Terms. In such
            cases, &quot;you&quot; and &quot;your&quot; refer to that organization.
          </p>
          <div className="terms-quote">
            <p>
              THESE TERMS CONTAIN AN ARBITRATION PROVISION AND A CLASS ACTION WAIVER. BY AGREEING TO
              THESE TERMS, YOU AGREE THAT DISPUTES WILL BE RESOLVED THROUGH BINDING INDIVIDUAL
              ARBITRATION AND YOU WAIVE YOUR RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT OR
              CLASS-WIDE ARBITRATION.
            </p>
          </div>

          <h2>2. Description of Services</h2>
          <p>
            Vincent provides a cloud-hosted, non-custodial key management and agent infrastructure
            platform. Through the Services, Users may provision and rent dedicated compute instances
            (&quot;Instances&quot; or &quot;Boxes&quot;) that host secure signing infrastructure, AI
            agent runtimes, and related tooling. The Services include, but are not limited to:
          </p>
          <ul>
            <li>Provisioning and management of dedicated cloud Instances</li>
            <li>Non-custodial private key generation, storage, and signing via API</li>
            <li>Policy engine configuration for transaction authorization</li>
            <li>AI agent deployment and lifecycle management</li>
            <li>Wallet infrastructure (smart accounts, token transfers, swaps)</li>
            <li>Integration APIs and developer tooling</li>
          </ul>
          <p>
            Vincent acts solely as an infrastructure provider. We do not act as your broker,
            intermediary, agent, advisor, or custodian, and we do not have a fiduciary relationship
            or obligation to you or any end users of your applications.
          </p>

          <h2>3. Rental of Infrastructure</h2>
          <h3>3.1 Nature of the Relationship</h3>
          <p>
            Your use of the Services constitutes a rental of cloud computing infrastructure. You are
            renting capacity on Vincent-managed servers and infrastructure. You do not acquire any
            ownership interest in the underlying hardware, software, or infrastructure. Vincent
            retains all right, title, and interest in the physical and virtual infrastructure
            comprising the Services.
          </p>

          <h3>3.2 Service Tiers and Provisioning</h3>
          <p>
            Instances are provisioned according to the service tier selected by you at the time of
            Account creation or as subsequently modified. Vincent will use commercially reasonable
            efforts to maintain the availability, performance, and security of your provisioned
            Instances in accordance with the applicable service tier.
          </p>

          <h3>3.3 Resource Allocation</h3>
          <p>
            Each Instance is allocated dedicated compute, memory, and storage resources as specified
            in your selected service tier. You may not exceed your allocated resources without
            upgrading your service tier. Vincent reserves the right to throttle or suspend Instances
            that exceed their resource allocation or that degrade the performance of shared
            infrastructure.
          </p>

          <h3>3.4 Data Residency</h3>
          <p>
            Unless otherwise specified in your service tier, Vincent makes no guarantees regarding
            the geographic location of the physical servers hosting your Instances. If data
            residency requirements apply to your use case, you are responsible for selecting a
            service tier that meets those requirements.
          </p>

          <h2>4. Accounts</h2>
          <h3>4.1 Registration</h3>
          <p>
            To use the Services, you must create an account (&quot;Account&quot;). You agree to
            provide accurate, current, and complete information during registration and to keep your
            Account information updated.
          </p>

          <h3>4.2 Authentication and Security</h3>
          <p>
            You are solely responsible for maintaining the confidentiality of your Account
            credentials, including API keys, authentication tokens, and any other access mechanisms
            (&quot;Authentication Credentials&quot;). You are responsible for all activity that
            occurs under your Account, whether authorized by you or not.
          </p>
          <p>
            You must notify Vincent immediately (and in no event later than 24 hours following
            discovery) if you suspect any unauthorized access to or use of your Account or
            Authentication Credentials.
          </p>
          <div className="terms-quote">
            <p>
              Vincent cannot reset your Authentication Credentials or recover access to your
              Account. If you lose access to your Authentication Credentials without having
              configured backup recovery methods, you may permanently lose access to your Account
              and any Private Keys or Digital Assets associated with it.
            </p>
          </div>

          <h2>5. Private Key Management</h2>
          <h3>5.1 Non-Custodial Architecture</h3>
          <p>
            Vincent provides a non-custodial private key management solution. When you generate
            Private Keys through the Services, encrypted forms of those Private Keys are stored on
            Vincent&apos;s infrastructure. However, Vincent does not have access to your raw Private
            Keys. Only authenticated users with valid Authentication Credentials can decrypt and use
            Private Keys for signing operations.
          </p>
          <div className="terms-quote">
            <p>
              Neither Vincent nor any other person or entity (other than your authorized users, as
              configured by you) will be able to unilaterally retrieve, use, or move the Digital
              Assets controlled by Private Keys generated through the Services.
            </p>
          </div>

          <h3>5.2 Policy Rules</h3>
          <p>
            &quot;Policy Rules&quot; means the machine-readable configurable rules or policies set
            by you governing what actions are permitted within the Services, including but not
            limited to transaction signing, spending limits, and allowlists. Vincent&apos;s sole
            responsibility is to execute requests that conform to your configured Policy Rules.
            Vincent does not independently verify the commercial reasonableness or legality of any
            transaction.
          </p>

          <h3>5.3 Key Export and Import</h3>
          <p>
            You may export Private Keys from the Services for use with other platforms or wallets
            (&quot;Key Export&quot;). Following Key Export, Vincent shall have no responsibility for
            or liability in connection with any exported Private Keys, or the Digital Assets
            associated therewith. Similarly, you may import externally generated Private Keys into
            the Services (&quot;Key Import&quot;). Vincent disclaims all liability for imported
            Private Keys, including their use outside the Services.
          </p>

          <h3>5.4 User Responsibility for Key Material</h3>
          <p>As between you and Vincent, you are solely responsible for:</p>
          <ul>
            <li>
              All Private Keys generated through, imported into, or exported from the Services
            </li>
            <li>All Digital Assets controlled by such Private Keys</li>
            <li>
              All implementation decisions regarding access to or control of Private Keys, including
              how you configure policies, authentication requirements, and recovery mechanisms for
              yourself and your end users
            </li>
            <li>
              Enabling Key Export or implementing alternative recovery mechanisms to ensure
              continued access to your Digital Assets in the event of Service interruption or
              termination
            </li>
          </ul>

          <h3>5.5 Irrecoverable Loss</h3>
          <p>
            Due to the non-custodial architecture, if you lose access to your Authentication
            Credentials and have not configured backup recovery mechanisms or exported your Private
            Keys, your Private Keys and any associated Digital Assets may be permanently
            irrecoverable. Vincent has no ability to recover lost Private Keys or Digital Assets on
            your behalf.
          </p>

          <h2>6. Digital Assets</h2>
          <p>
            &quot;Digital Assets&quot; means any cryptocurrency, digital token, or blockchain-based
            asset (including but not limited to ETH, ERC-20 tokens, and NFTs) that can be controlled
            via Private Keys managed through the Services.
          </p>
          <p>
            Vincent does not own, control, or custody your Digital Assets. You retain sole ownership
            and control of all Digital Assets associated with your Private Keys. Vincent makes no
            representations or warranties regarding the value, legality, or transferability of any
            Digital Assets.
          </p>
          <p>
            Transactions submitted through the Services are broadcast to the applicable blockchain
            network and may not be completed, may be substantially delayed, or may fail due to
            network conditions, gas fees, smart contract behavior, or other factors outside
            Vincent&apos;s control. Vincent is not responsible for the outcome of any blockchain
            transaction.
          </p>

          <h2>7. Fees and Payment</h2>
          <h3>7.1 Rental Fees</h3>
          <p>
            You agree to pay all fees associated with your selected service tier and usage
            (&quot;Fees&quot;). Fees are billed in advance on a recurring basis (monthly or
            annually, as selected) unless otherwise specified. All Fees are non-refundable except as
            expressly provided in these Terms.
          </p>

          <h3>7.2 Usage-Based Charges</h3>
          <p>
            Certain Services may incur usage-based charges (e.g., API calls, compute hours,
            bandwidth) in addition to base Fees. Usage-based charges are billed in arrears and are
            due upon invoicing.
          </p>

          <h3>7.3 Price Changes</h3>
          <p>
            Vincent reserves the right to modify Fees upon 30 days&apos; prior written notice.
            Continued use of the Services after a price change takes effect constitutes acceptance
            of the updated Fees. If you do not agree to a price change, you may terminate your
            Account before the change takes effect.
          </p>

          <h3>7.4 Taxes</h3>
          <p>
            All Fees are exclusive of taxes. You are responsible for all taxes, duties, and
            governmental assessments associated with your use of the Services, except for taxes on
            Vincent&apos;s net income.
          </p>

          <h3>7.5 Late Payment</h3>
          <p>
            Unpaid Fees may accrue interest at the lesser of 1.5% per month or the maximum rate
            permitted by applicable law. Vincent reserves the right to suspend or terminate your
            access to the Services for non-payment.
          </p>

          <h2>8. Service Level and Availability</h2>
          <p>
            Vincent will use commercially reasonable efforts to maintain Service availability.
            However, the Services are provided without any guaranteed uptime or service level
            agreement (&quot;SLA&quot;) unless a separate SLA has been agreed to in writing between
            you and Vincent.
          </p>
          <p>
            Vincent may perform scheduled maintenance with reasonable advance notice. Emergency
            maintenance may be performed without prior notice when necessary to protect the
            integrity, security, or availability of the Services.
          </p>

          <h2>9. Acceptable Use</h2>
          <p>
            You agree to use the Services only in compliance with all applicable laws and
            regulations. You represent and warrant that your use of the Services is not prohibited
            by any applicable law or regulation and that you possess all necessary permits and
            licenses required for your use.
          </p>
          <p>You shall not use the Services to:</p>
          <ul>
            <li>
              Violate any applicable law, regulation, or third-party right, including export
              controls and economic sanctions (including OFAC-administered sanctions programs)
            </li>
            <li>
              Engage in fraud, money laundering, terrorist financing, or other financial crimes
            </li>
            <li>Infringe or misappropriate any intellectual property or proprietary right</li>
            <li>
              Interfere with, disrupt, or degrade the Services or the infrastructure supporting them
            </li>
            <li>
              Attempt to gain unauthorized access to other users&apos; Accounts, Instances, Private
              Keys, or Authentication Credentials
            </li>
            <li>
              Reverse engineer, decompile, or disassemble any part of the Services (except as
              permitted by applicable law)
            </li>
            <li>Use the Services to build a competing product or service</li>
            <li>
              Sublicense, resell, or redistribute access to the Services without Vincent&apos;s
              prior written consent
            </li>
          </ul>
          <p>
            Violation of this section may result in immediate suspension or termination of your
            Account without prior notice.
          </p>

          <h2>10. Your Data and Content</h2>
          <p>
            &quot;User Data&quot; means all data, content, configurations, and materials that you
            upload, submit, store, or transmit through the Services. You retain all right, title,
            and interest in your User Data. You grant Vincent a limited, non-exclusive license to
            host, store, and process your User Data solely to the extent necessary to provide the
            Services.
          </p>
          <p>
            You are solely responsible for the legality, reliability, integrity, accuracy, and
            quality of your User Data. Vincent does not monitor, review, or endorse User Data and
            assumes no liability for User Data.
          </p>

          <h2>11. Intellectual Property</h2>
          <p>
            The Services, including all software, APIs, documentation, user interfaces, designs, and
            related technology (&quot;Vincent Materials&quot;) are owned by Vincent or its licensors
            and are protected by copyright, patent, trade secret, trademark, and other intellectual
            property laws. Except for the limited rights expressly granted herein, Vincent reserves
            all rights in the Vincent Materials.
          </p>
          <p>
            Subject to your compliance with these Terms, Vincent grants you a limited,
            non-exclusive, non-transferable, revocable license to access and use the Services and
            Vincent Materials solely for your internal business purposes during the term of your
            subscription.
          </p>
          <p>
            Any Vincent product or service names, logos, and marks used in connection with the
            Services are trademarks of Vincent or its licensors. You may not use such marks without
            Vincent&apos;s prior written consent.
          </p>

          <h2>12. Third-Party Services</h2>
          <p>
            The Services may integrate with or contain links to third-party services, products, or
            content (&quot;Third-Party Services&quot;). Vincent does not control, endorse, or assume
            responsibility for Third-Party Services. Your use of Third-Party Services is at your own
            risk and subject to the applicable third party&apos;s terms and conditions.
          </p>
          <p>
            Any feedback, suggestions, or ideas you provide to Vincent regarding the Services may be
            used by Vincent without restriction, compensation, or attribution.
          </p>

          <h2>13. Suspension and Termination</h2>
          <h3>13.1 Termination by You</h3>
          <p>
            You may terminate your Account at any time by providing notice through your Account
            settings or by contacting Vincent support. Prior to termination, you should export any
            Private Keys or User Data you wish to retain. Upon termination, Vincent will make
            commercially reasonable efforts to allow a 30-day wind-down period for data and key
            export, after which your Instances and all associated data may be permanently deleted.
          </p>

          <h3>13.2 Termination by Vincent</h3>
          <p>
            Vincent may suspend or terminate your access to the Services at any time for any reason,
            including breach of these Terms, non-payment, or if required by law. Where practicable,
            Vincent will provide reasonable advance notice and an opportunity to export Private Keys
            and User Data prior to termination.
          </p>

          <h3>13.3 Effect of Termination</h3>
          <p>
            Upon termination: (a) your license to use the Services immediately terminates; (b) you
            must cease all use of the Services; (c) you remain liable for all Fees accrued prior to
            termination. Sections relating to intellectual property, limitation of liability,
            indemnification, dispute resolution, and any other provisions that by their nature
            should survive, will survive termination.
          </p>

          <h2>14. Disclaimer of Warranties</h2>
          <div className="terms-quote">
            <p>
              THE SERVICES AND ALL VINCENT MATERIALS ARE PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY,
              OR OTHERWISE, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
              FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
            </p>
          </div>
          <p>
            Without limiting the foregoing, Vincent does not warrant that: (a) the Services will be
            uninterrupted, error-free, or secure; (b) defects will be corrected; (c) the Services or
            infrastructure are free of viruses or harmful components; or (d) the results of using
            the Services will meet your requirements.
          </p>
          <p>
            Vincent makes no representations or warranties regarding: the value, ownership,
            legality, or transferability of any Digital Assets; the security or reliability of any
            blockchain network; the continued viability of any cryptographic algorithm; or the
            performance of any smart contract.
          </p>

          <h2>15. Limitation of Liability</h2>
          <div className="terms-quote">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL VINCENT, ITS AFFILIATES,
              OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO
              LOSS OF PROFITS, DATA, DIGITAL ASSETS, USE, OR GOODWILL, ARISING OUT OF OR IN
              CONNECTION WITH THESE TERMS OR THE SERVICES, WHETHER BASED ON WARRANTY, CONTRACT, TORT
              (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR ANY OTHER LEGAL THEORY, EVEN IF VINCENT
              HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
          </div>
          <p>
            <strong>Liability cap:</strong> Vincent&apos;s total aggregate liability arising out of
            or in connection with these Terms or the Services shall not exceed the greater of (a)
            $100 USD, or (b) the total Fees paid by you to Vincent during the twelve (12) months
            immediately preceding the event giving rise to the claim.
          </p>
          <p>
            Vincent expressly disclaims any liability for: loss of or inability to access Private
            Keys or Digital Assets; unauthorized access to your Account resulting from compromised
            Authentication Credentials; failed, delayed, or reverted blockchain transactions;
            actions taken by AI agents deployed through the Services; and losses resulting from
            circumstances beyond Vincent&apos;s reasonable control.
          </p>

          <h2>16. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless Vincent, its affiliates, officers,
            directors, employees, and agents from and against any claims, liabilities, damages,
            losses, costs, and expenses (including reasonable attorneys&apos; fees) arising out of
            or relating to: (a) your use of the Services; (b) your User Data; (c) your violation of
            these Terms; (d) your violation of any applicable law or regulation; (e) your end
            users&apos; use of applications built on the Services; or (f) any dispute between you
            and a third party.
          </p>

          <h2>17. Modifications to Terms</h2>
          <p>
            Vincent reserves the right to modify these Terms at any time. We will provide at least
            30 days&apos; notice of material changes by posting the updated Terms on the Website and
            updating the &quot;Last Updated&quot; date. Your continued use of the Services after the
            effective date of any modifications constitutes acceptance of the modified Terms. If you
            do not agree to the modified Terms, you must stop using the Services and terminate your
            Account.
          </p>

          <h2>18. Governing Law and Dispute Resolution</h2>
          <div className="terms-quote">
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the
              State of Delaware, without regard to its conflict of law provisions.
            </p>
          </div>
          <p>
            Any dispute, controversy, or claim arising out of or relating to these Terms or the
            Services shall be resolved by binding arbitration administered by JAMS under its
            Streamlined Arbitration Rules and Procedures. The arbitration shall be conducted by a
            single arbitrator in Wilmington, Delaware. Judgment on the award may be entered in any
            court of competent jurisdiction.
          </p>
          <div className="terms-quote">
            <p>
              YOU AND VINCENT EACH WAIVE THE RIGHT TO A TRIAL BY JURY AND THE RIGHT TO PARTICIPATE
              IN A CLASS ACTION, COLLECTIVE ACTION, OR REPRESENTATIVE PROCEEDING. YOU MAY ONLY BRING
              CLAIMS AGAINST VINCENT IN YOUR INDIVIDUAL CAPACITY.
            </p>
          </div>
          <p>
            Either party may seek injunctive or other equitable relief in any court of competent
            jurisdiction to prevent the actual or threatened infringement, misappropriation, or
            violation of intellectual property rights.
          </p>

          <h2>19. Risk Disclosures</h2>
          <p>By using the Services, you acknowledge and accept the following risks:</p>
          <ul>
            <li>
              <strong>Blockchain risks:</strong> Transactions on blockchain networks are
              irreversible. Network congestion, forks, protocol changes, 51% attacks, and other
              events may affect transaction processing and Digital Asset security.
            </li>
            <li>
              <strong>Cryptographic risks:</strong> Advances in cryptography or computing (including
              quantum computing) could theoretically compromise the cryptographic algorithms
              underlying Private Keys and blockchain networks.
            </li>
            <li>
              <strong>Regulatory risks:</strong> The regulatory landscape for Digital Assets and
              blockchain technology is evolving. Changes in law or regulation may adversely affect
              the Services or your ability to use them.
            </li>
            <li>
              <strong>Smart contract risks:</strong> Smart contracts may contain bugs,
              vulnerabilities, or behave in unexpected ways. Vincent makes no representations about
              the security or correctness of any smart contract.
            </li>
            <li>
              <strong>AI agent risks:</strong> AI agents deployed through the Services may take
              actions that result in unintended consequences, including financial loss. You are
              responsible for configuring appropriate Policy Rules and oversight mechanisms for any
              AI agents operating on your behalf.
            </li>
            <li>
              <strong>Credential loss risks:</strong> Loss of Authentication Credentials without
              configured backup recovery may result in permanent loss of access to your Account,
              Private Keys, and Digital Assets.
            </li>
          </ul>

          <h2>20. Assignment</h2>
          <p>
            You may not assign or transfer your rights or obligations under these Terms without
            Vincent&apos;s prior written consent. Vincent may assign these Terms, in whole or in
            part, to any affiliate or in connection with a merger, acquisition, reorganization, or
            sale of all or substantially all of its assets, without your consent.
          </p>

          <h2>21. Security Vulnerabilities</h2>
          <p>
            If you discover a security vulnerability in the Services, please report it responsibly
            to: <a href="mailto:info@heyvincent.ai">info@heyvincent.ai</a>
          </p>

          <h2>22. Miscellaneous</h2>
          <p>
            <strong>Entire Agreement.</strong> These Terms, together with the Privacy Policy and any
            applicable service-tier agreements, constitute the entire agreement between you and
            Vincent with respect to the Services and supersede all prior or contemporaneous
            communications and proposals.
          </p>
          <p>
            <strong>Severability.</strong> If any provision of these Terms is held to be
            unenforceable, that provision will be modified to the minimum extent necessary to make
            it enforceable, and the remaining provisions will continue in full force and effect.
          </p>
          <p>
            <strong>Waiver.</strong> Vincent&apos;s failure to enforce any right or provision of
            these Terms shall not constitute a waiver of such right or provision.
          </p>
          <p>
            <strong>Independent Contractors.</strong> The parties are independent contractors.
            Nothing in these Terms creates a partnership, joint venture, employment, or agency
            relationship between you and Vincent.
          </p>
          <p>
            <strong>No Third-Party Beneficiaries.</strong> These Terms do not confer any rights on
            any third party.
          </p>
          <p>
            <strong>Force Majeure.</strong> Vincent shall not be liable for any failure or delay in
            performing its obligations under these Terms due to causes beyond its reasonable
            control, including but not limited to acts of God, natural disasters, war, terrorism,
            pandemic, government actions, power failures, internet disruptions, or third-party
            service outages.
          </p>
          <p>
            <strong>Notices.</strong> Vincent may provide notices to you via email to the address
            associated with your Account or by posting on the Website. You may provide notices to
            Vincent at the contact information provided on the Website.
          </p>

          <hr />
          <p>Copyright {new Date().getFullYear()} Workgraph, Inc. All rights reserved.</p>
        </div>
      </div>
    </PageShell>
  );
}
