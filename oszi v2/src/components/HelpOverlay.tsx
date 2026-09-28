interface Props { onClose: () => void }

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <h3 className="mb-1 text-[14px] font-bold text-[#1e3f8f]">{title}</h3>
    <div className="text-[12.5px] leading-relaxed text-[#333]">{children}</div>
  </div>
);

export default function HelpOverlay({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-[880px] overflow-auto rounded-2xl bg-gradient-to-b from-[#f7f7f5] to-[#e6e6e2] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[22px] font-black italic text-[#1e3f8f]">OTX2074 – Kurzanleitung</h2>
          <button className="sk-btn" style={{ width: 80, height: 30 }} onClick={onClose}>Schließen</button>
        </div>
        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <Section title="Bedienung der Drehknöpfe">
              Knöpfe mit der Maus <b>ziehen</b> (kreisend oder hoch/runter) oder mit dem <b>Mausrad</b> drehen. Ein <b>Klick</b> auf den Knopf
              entspricht dem Drücken (z. B. Position auf 0, Triggerpegel auf 50 %, V/div-Feineinstellung).
            </Section>
            <Section title="Erste Schritte">
              1. Tastkopf im Bereich „Tastköpfe“ <b>aufnehmen</b> (oder auf die BNC-Buchse klicken).<br />
              2. Auf einen Messpunkt klicken: TP1–TP4 der Kippstufe, GEN-Ausgang oder den <b>Probe-Comp</b>-Anschluss am Oszilloskop.<br />
              3. <b>Autoset</b> drücken – fertig. Oder V/div, s/div und Trigger manuell einstellen.
            </Section>
            <Section title="Vertikal">
              Kanaltaste <b>1–4</b>: Kanal ein / Menü öffnen / (erneut) aus. Menü: Kopplung DC/AC/GND, Invertieren, 20‑MHz‑Bandbreitenbegrenzung,
              Tastkopffaktor 1X/10X. <b>Achtung:</b> Stimmt der Faktor am Oszilloskop nicht mit dem Schalter am Tastkopf überein, wird die Spannung um Faktor 10 falsch angezeigt!<br />
              <b>Math</b>: CH‑Addition, Subtraktion, Multiplikation. <b>FFT</b>: Spektrum mit Fensterfunktionen. <b>Ref</b>: Kurven als Referenz R1/R2 speichern.
            </Section>
            <Section title="Horizontal">
              <b>Scale</b>: Zeitbasis (2 ns … 100 s/div, ab 100 ms/div Roll-Modus). <b>Position</b>: verschiebt den Triggerpunkt (Verzögerung).
              <b>Acquire</b>: Abtastung, Spitzenwert (gegen Aliasing), Mittelwert (rauscharm), hohe Auflösung, XY-Modus.
              <b>Zoom</b>: geteilter Bildschirm – Faktor & Position mit dem Mehrzweckknopf.
            </Section>
          </div>
          <div>
            <Section title="Trigger">
              <b>Level</b>: Triggerschwelle (orange Marke rechts). <b>Menu</b>: Quelle, Flanke, Modus Auto/Normal, Holdoff.
              Auto zeigt auch ohne Triggerereignis eine Kurve, Normal wartet. <b>Single</b>: Einzelaufnahme, danach Stopp. <b>Force Trig</b>: erzwingt eine Aufnahme.
            </Section>
            <Section title="Messen">
              <b>Measure</b>: Quelle & Messart (Frequenz, Periode, Ss, Amplitude, Anstiegszeit, Tastgrad …) mit dem Mehrzweckknopf wählen
              und „Hinzufügen“. Statistik zeigt Mittel/Min/Max. <b>Cursors</b>: Zeit-, Amplituden- oder Bildschirmcursor, Mehrzweckknopf verschiebt,
              Drücken wechselt a/b, <b>Fine</b> für feine Schritte.
            </Section>
            <Section title="Seitenmenü">
              Die Tasten rechts neben dem Bildschirm bedienen das eingeblendete Menü. Ein blaues <b>ⓐ</b> zeigt, dass der Wert mit dem
              Mehrzweckknopf eingestellt wird. <b>Menu On/Off</b> blendet das Menü aus/ein. <b>Save</b> speichert schnell (Bildschirmfoto/CSV/Setup).
            </Section>
            <Section title="Search & Mark">
              <b>Search</b> markiert alle Flanken im Datensatz (weiße Dreiecke). Mit <b>← / →</b> springt man zur nächsten Marke,
              <b>Set/Clear</b> setzt/löscht eine eigene Marke in der Bildschirmmitte.
            </Section>
            <Section title="Experimente">
              • Tastkopf an COMP legen und den <b>Abgleich-Trimmer</b> verstellen – Über-/Unterkompensation sichtbar.<br />
              • Kippstufe: C1 ≠ C2 wählen → Tastgrad ändert sich. Bei 10 µF blinken die LEDs sichtbar (Roll-Modus nutzen).<br />
              • Funktionsgenerator 1 MHz bei 10 ms/div: Aliasing! Mit Acquire → Spitzenwert erkennen.<br />
              • Rauschen einschalten und Mittelwertbildung testen.
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
