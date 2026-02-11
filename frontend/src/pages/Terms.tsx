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
          background: rgba(249,115,22,0.04); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          font-style: italic;
        }
        .terms-page .terms-quote p { margin-bottom: 0; }
        .terms-page hr { border: none; border-top: 1px solid var(--border); margin: 3rem 0; }
      `}</style>
      <div className="terms-page">
        <div className="container-narrow">
          <h1>Terms of Service</h1>
          <p className="terms-updated">Last Updated: June 5, 2023</p>

          <p>Lit Association and affiliates ("Lit," "we," "us") welcome you to access and use litprotocol.com (the "Website") and associated products, services, and applications (the "Services"). These Terms constitute a binding contract between you and Lit.</p>

          <h2>Binding Agreement</h2>
          <p>By accessing the Website and/or Services, you acknowledge reading and agreeing to be legally bound by these Terms and the Privacy Policy (collectively, the "Agreement"). If you don't agree, you may not use the Website or Services.</p>
          <p>If you represent an organization, you warrant authority to bind that entity to these Terms.</p>
          <div className="terms-quote">
            <p>"THE TERMS CONTAIN AN ARBITRATION PROVISION. YOU AGREE AND UNDERSTAND THAT DISPUTES ARISING UNDER THESE TERMS SHALL BE SETTLED IN BINDING ARBITRATION."</p>
          </div>
          <p>Developers using the API/SDK are governed by the Developer API & SDK License Agreement, which takes precedence in case of conflict.</p>

          <h2>Term Modifications</h2>
          <p>Lit reserves the right to modify Terms at any time with or without notice. Continued use after modifications indicates acceptance. The company may suspend, discontinue, or modify Services and remove Content at its sole discretion.</p>

          <h2>Permitted Use</h2>
          <p>You may use Services only for personal, internal use in compliance with applicable laws. You represent that use is not prohibited by applicable regulations and that you possess necessary permits and licenses.</p>

          <h2>Privacy</h2>
          <p>Lit takes user privacy seriously. Details available at: <a href="https://litprotocol.com/legal/privacy-policy" target="_blank" rel="noreferrer">https://litprotocol.com/legal/privacy-policy</a></p>

          <h2>Service Basics</h2>
          <p>Services enable passwordless authentication and access control. Developer Apps manage individual accounts; Lit has no control over these accounts and bears no responsibility for account misuse.</p>
          <p>Some Services are free; Lit reserves rights to impose future fees with advance notice.</p>

          <h2>Wallet and Virtual Currency</h2>
          <p>Users may create digital wallets storing supported Virtual Currency. "Virtual Currency" means cryptocurrency/digital assets like Ethereum (excludes derivatives/securities) evidenced on Blockchains.</p>
          <p>"Blockchain" refers to distributed ledgers recording transactions in timestamped blocks forming an unchangeable chain.</p>

          <h3>Key Management</h3>
          <p>Creating a Wallet generates cryptographic private/public key pairs.</p>
          <div className="terms-quote">
            <p>"The private key must be used to transact the Virtual Currency represented by the corresponding public key. Lit does not store your whole private key in its database and will never request your private key."</p>
          </div>
          <p>Lit uses AMD-SEV-SNP and threshold cryptography to manage private keys securely while maintaining user control.</p>

          <h3>Authorization and Transfers</h3>
          <p>To initiate Virtual Currency transfers, users must validate authorization credentials (phone, email, oAuth). Multi-factor authentication may be required. Transfers require 2/3 network confirmation.</p>
          <div className="terms-quote">
            <p>"You will be responsible for keeping your authorization credentials secure and for any activity associated with your Wallet."</p>
          </div>
          <p><strong>Important:</strong> Lit cannot access raw private keys, unilaterally initiate transfers, or reverse transactions submitted to Blockchains.</p>

          <h2>Prohibited Uses</h2>
          <p>You warrant not using Services in ways that:</p>
          <ul>
            <li>Infringe intellectual property or other rights</li>
            <li>Violate laws, export controls, or sanctions (including OFAC restrictions on embargoed countries)</li>
            <li>Are fraudulent, deceptive, threatening, or harassing</li>
            <li>Jeopardize account security</li>
            <li>Attempt unauthorized access to accounts or credentials</li>
          </ul>
          <p>Violations permit service termination.</p>

          <h2>Risk Assumptions</h2>
          <p>Users assume responsibility for:</p>
          <ul>
            <li>Possessing necessary technical expertise to evaluate Wallet security</li>
            <li>Understanding Virtual Currency and Blockchain risks</li>
            <li>All Wallet activities and unauthorized access risks</li>
            <li>Securing authorization credentials and private key copies</li>
          </ul>
          <p>Lit disclaims liability for:</p>
          <ul>
            <li>Virtual Currency ownership, validity, or market conditions</li>
            <li>Blockchain design flaws, governance, or protocol changes</li>
            <li>Cryptography advancements rendering algorithms inoperative</li>
            <li>Blockchain hacks, double-spending, majority attacks</li>
            <li>AMD-SEV-SNP security vulnerabilities</li>
            <li>Phishing attempts or credential theft</li>
          </ul>
          <div className="terms-quote">
            <p>"The transaction details you submit via the Services may not be completed, or may be substantially delayed, by the relevant Blockchain."</p>
          </div>

          <h2>Intellectual Property Rights</h2>
          <p>Content (text, graphics, data, images) is protected by copyright and intellectual property laws. Users may not reproduce, distribute, or exploit Content without owner consent, except as expressly licensed.</p>
          <p>Lit owns all Services technology and materials (except incorporated open-source components). Users receive a limited, revocable, non-transferable license to access Services and must comply with applicable Open Source Licenses.</p>
          <div className="terms-quote">
            <p>"Any of Lit's product or service names, logos, and other marks...are trademarks owned by Lit, its affiliates or its applicable licensors."</p>
          </div>

          <h2>Third-Party Content and Liability</h2>
          <p>Third-party content responsibility rests with originators. Lit bears no liability for third-party errors, omissions, or damages.</p>
          <p>Communications sent to Lit (feedback, suggestions) may be used freely by Lit for development and marketing without compensation or attribution. Users represent possessing all necessary rights.</p>
          <p>Services may contain links to third-party websites/services. Lit assumes no responsibility for third-party content, accuracy, or practices.</p>
          <div className="terms-quote">
            <p>"Your interactions with organizations and/or individuals found on or through the Services...are solely between you and such organizations and/or individuals."</p>
          </div>
          <p>Users release Lit from liability arising from third-party website use.</p>

          <h2>Dispute Resolution</h2>
          <p>Lit assumes no obligation to mediate user disputes. Users release Lit from claims arising from disputes with other users.</p>
          <p>California residents waive Civil Code Section 1542 rights regarding unknown claims.</p>

          <h2>Account Termination</h2>
          <p>Users may cease Services use anytime. Users can export private keys via account access. Upon export, Lit disclaims all liability for private key copies and associated Virtual Currency.</p>
          <div className="terms-quote">
            <p>"LIT DISCLAIMS ANY AND ALL LIABILITY WITH RESPECT TO YOUR PRIVATE KEY COPY AND ANY VIRTUAL CURRENCY THAT WAS CONTAINED IN YOUR WALLET ON LIT'S SERVICES."</p>
          </div>
          <p>Users alone bear responsibility for managing and securing private key copies. Lost private keys cannot be recovered by Lit.</p>
          <p>Lit may terminate Services access for any reason, including Terms breach, endeavoring to contact users for private key export.</p>
          <p>Provisions surviving termination include payment obligations, liability limitations, intellectual property terms, and dispute resolution clauses.</p>

          <h2>Warranties and Limitations</h2>
          <div className="terms-quote">
            <p>"Neither Lit nor its licensors or suppliers make any representations or warranties concerning any content contained in or accessed through the Services."</p>
          </div>
          <div className="terms-quote">
            <p>"THE SERVICES AND CONTENT ARE PROVIDED BY LIT (AND ITS LICENSORS AND SUPPLIERS) ON AN 'AS-IS' BASIS, WITHOUT WARRANTIES OR ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT."</p>
          </div>
          <p>Lit bears no liability for:</p>
          <ul>
            <li>Virtual Currency ownership, validity, collectability, or marketability</li>
            <li>Losses from circumstances beyond control (acts of God, war, terrorism, natural disasters, third-party non-performance)</li>
          </ul>
          <p><strong>Liability cap:</strong> Lit's liability shall not exceed the greater of $100 or amounts paid by user to Lit in the preceding 12 months, excluding indirect, special, incidental, consequential damages.</p>

          <h2>Indemnification</h2>
          <p>Users agree to indemnify Lit, affiliates, officers, agents, and employees against claims arising from user Services use, account content, third-party right violations, or Terms breaches. Lit will attempt notice of claims.</p>

          <h2>Assignment</h2>
          <p>Users may not assign rights or obligations without Lit's written consent. Lit may assign to affiliates or successors without consent.</p>

          <h2>Governing Law and Arbitration</h2>
          <div className="terms-quote">
            <p>"These Terms are governed by and will be construed under the laws of the State of Delaware, without regard to the conflicts of laws provisions thereof."</p>
          </div>
          <p>Disputes shall be settled by binding arbitration in Kent County, Delaware under JAMS Streamlined Arbitration Rules, administered by one commercial arbitrator experienced in intellectual property and contract disputes.</p>
          <p>Each party may pursue injunctive relief in competent courts. Parties consent to exclusive Kent County, Delaware jurisdiction.</p>
          <p>Arbitration occurs on individual basis; class arbitrations and class actions are prohibited.</p>
          <div className="terms-quote">
            <p>"YOU AGREE THAT YOU MAY BRING CLAIMS AGAINST US ONLY IN YOUR INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING."</p>
          </div>
          <div className="terms-quote">
            <p>"YOU UNDERSTAND AND AGREE THAT BY ENTERING INTO THESE TERMS, YOU AND LIT ARE EACH WAIVING THE RIGHT TO TRIAL BY JURY OR TO PARTICIPATE IN A CLASS ACTION."</p>
          </div>

          <h2>Security Vulnerabilities</h2>
          <p>Report vulnerabilities to: <a href="mailto:support@litprotocol.com">support@litprotocol.com</a></p>

          <h2>Miscellaneous</h2>
          <p>Users bear responsibility for all taxes and governmental assessments associated with Services activity. Lit may exercise tax obligations at its discretion.</p>
          <p>Failure to exercise any right shall not constitute waiver of future rights. Unenforceable provisions will be limited minimally to preserve remaining Terms.</p>
          <p>These Terms constitute the complete understanding between parties, superseding prior agreements and communications.</p>
          <p>Users are not Lit employees, agents, partners, or joint ventures and possess no authority to bind Lit.</p>
          <p>No third-party beneficiaries are intended.</p>

          <hr />
          <p>Copyright 2023, All rights reserved.</p>
        </div>
      </div>
    </PageShell>
  );
}
