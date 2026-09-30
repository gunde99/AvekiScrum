import "./OvrigtPanel.css";

/** The agenda's last stop, right after the closing flash - shows the "Are there any questions?"
 *  photo instead of RolePlaceholderPanel's generic "innehåll inte byggt än" note, which never fit a
 *  step that has nothing to build (open discussion, not a role's data view). */
export function OvrigtPanel() {
  return (
    <div className="tcb-ovrigt">
      <img className="tcb-ovrigt__photo" src="/rollbilder/ovrigt.jpg" alt="Är det några frågor?" />
    </div>
  );
}
