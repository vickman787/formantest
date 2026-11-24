import { QUSDC_ADDRESS } from "@/lib/config";

export default function Help() {
  return (
    <div className="wrap" style={{ paddingTop: 32, maxWidth: 860 }}>
      <h1 style={{ fontSize: 36 }}>How Forma works</h1>

      <div className="box" style={{ marginTop: 24 }}>
        <h2>Payment</h2>
        <p>Every service costs <b>1 QUSDC</b> (1,000,000 base units, 6 decimals) — approximately $1 at launch. We do not guarantee a dollar price. Network fees are separate and paid in QIE.</p>
        <p>QUSDC on QIE Mainnet (chain 1990): <span className="mono">{QUSDC_ADDRESS}</span>. You must already hold QUSDC and enough QIE for gas. Forma has no bridge, mint, swap or on-ramp: QUSDC is bridged Ethereum USDC locked as collateral elsewhere, and you exit the same way. We do not advertise guaranteed safety or cash redemption for QUSDC.</p>
        <p>Your payment goes into a minimal escrow contract — not to Forma directly. It is released to the Forma treasury only when you accept the delivery, when the review window passes, or refunded to you if delivery is missed or the job genuinely fails.</p>
      </div>

      <div className="box" style={{ marginTop: 16 }}>
        <h2>Deadlines</h2>
        <ul>
          <li><b>Fund within 30 minutes</b> of your quote, or the quote expires and you start again.</li>
          <li><b>Delivery within 24 hours</b> of confirmed funding.</li>
          <li><b>Review within 48 hours</b> of delivery. If you do nothing, the payment is released automatically after the window — time alone does not move money; our reconciler submits the release.</li>
          <li><b>Missed delivery:</b> after the delivery deadline passes with no delivery, you can claim a refund of your 1 QUSDC.</li>
        </ul>
      </div>

      <div className="box" style={{ marginTop: 16 }}>
        <h2>Demo vs live</h2>
        <p><b>Demo mode</b> simulates payment — no funds move, and every receipt is labelled demo. It exists so you can try the whole flow before mainnet.</p>
        <p><b>Live mode</b> runs on QIE Mainnet with real QUSDC. A wallet prompt or a transaction hash is not proof of funding: our server reads the receipt and the escrow event before any work starts.</p>
      </div>

      <div className="box" style={{ marginTop: 16 }}>
        <h2>What we never invent</h2>
        <p>Your prices, contact details, testimonials and business claims come only from your brief. If a detail is missing, we ask you or leave it out. Reports separate sourced facts from inference and say plainly when evidence is thin.</p>
      </div>

      <div className="box" style={{ marginTop: 16 }}>
        <h2>Problems and refunds</h2>
        <p>Report a problem from your project page. A genuine failure before settlement can be refunded by the operator. You cannot receive the output and then refund it just by pressing Reject — acceptance and refunds follow the escrow terms, not a button.</p>
      </div>
    </div>
  );
}
