import { Check, FileSpreadsheet, Mail, ShieldCheck } from "lucide-react";

export function FloatingMailScene() {
  return <div className="floating-mail-illustration">
    <div role="img" aria-label="Illustration of a spreadsheet becoming a personalized email, ready for your review" className="mail-scene">
      <div aria-hidden="true" className="mail-scene-art">
        <div className="mail-orbit" />
        <div className="mail-float mail-source"><span className="mail-mini-icon"><FileSpreadsheet size={18} /></span><div><span className="mail-kicker">Your spreadsheet</span><strong>Every row, made personal</strong><span className="mail-field">Company · Name · Email</span></div></div>
        <div className="mail-float mail-message">
          <div className="mail-window-bar"><span /><span /><span /><small>Email preview</small><Mail size={16} /></div>
          <div className="mail-message-content"><span className="mail-kicker">A message, not a mail merge</span><h2>An idea for Northstar</h2><div className="mail-recipient"><span className="mail-avatar">A</span><div><strong>Alex at Northstar</strong><small>From your connected mailbox</small></div></div><div className="mail-message-body"><p>Hi Alex,</p><p>A thoughtful introduction.<br />Personalized with your spreadsheet.</p><span className="mail-signature-line" /><small>Your signature, your style.</small></div></div>
          <div className="mail-envelope"><svg viewBox="0 0 200 140" fill="none"><path d="M10 42 100 4 190 42v86H10Z" fill="var(--envelope-back)" stroke="var(--envelope-edge)" /><path d="M29 19h142v105H29Z" fill="var(--envelope-paper)" stroke="var(--envelope-edge)" /><path d="M49 39h80M49 54h102M49 69h67" stroke="var(--envelope-line)" strokeWidth="5" strokeLinecap="round" /><path d="M10 42v86h180V42l-90 61Z" fill="var(--envelope-front)" stroke="var(--envelope-edge)" /><path d="m10 128 62-52 28 27 28-27 62 52" fill="var(--envelope-fold)" stroke="var(--envelope-edge)" /></svg></div>
        </div>
        <div className="mail-float mail-review"><span className="mail-mini-icon"><ShieldCheck size={18} /></span><div><strong>Ready for your review</strong><span><Check size={13} />Right recipient</span><span><Check size={13} />Personal details checked</span><span><Check size={13} />You confirm the send</span></div></div>
      </div>
    </div>

  </div>;
}
