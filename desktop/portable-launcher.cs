using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("MultiSpice")]
[assembly: AssemblyProduct("MultiSpice")]
[assembly: AssemblyDescription("MultiSpice Schaltungssimulation & virtuelles Messlabor")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace MultiSpicePortable
{
    internal sealed class SplashForm : Form
    {
        private static readonly string[] Messages = new string[]
        {
            "Lötkolben wird auf 350 °C vorgeheizt …",
            "Widerstände nach Farbringen sortieren …",
            "Magischen Rauch in die ICs füllen …",
            "Oszilloskop-Strahl entknoten …",
            "Kondensatoren auf Nennspannung streicheln …",
            "Kalte Lötstellen höflich wegdiskutieren …",
            "Kirchhoffsche Knotenregeln durchsetzen …",
            "Tastköpfe auf 10:1 abgleichen …",
            "Operationsverstärker beruhigen …",
            "Entkopplungskondensatoren verteilen …"
        };

        private readonly System.Windows.Forms.Timer animTimer;
        private readonly Image logoImage;
        private float angle = 0f;
        private int msgIndex = 0;
        private int tickCount = 0;
        private Process childProcess = null;
        private int childSeenMainWindowTicks = 0;
        private bool dragging = false;
        private Point dragStart;

        [DllImport("Gdi32.dll", EntryPoint = "CreateRoundRectRgn")]
        private static extern IntPtr CreateRoundRectRgn(
            int nLeftRect, int nTopRect, int nRightRect, int nBottomRect,
            int nWidthEllipse, int nHeightEllipse);

        public SplashForm()
        {
            this.Text = "MultiSpice";
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Size = new Size(380, 236);
            this.ShowInTaskbar = true;
            this.DoubleBuffered = true;
            this.BackColor = Color.FromArgb(13, 16, 23);

            try
            {
                Icon exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (exeIcon != null)
                {
                    this.Icon = exeIcon;
                }
            }
            catch { }

            try
            {
                Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("favicon.png");
                if (s != null)
                {
                    logoImage = Image.FromStream(s);
                }
            }
            catch { }

            try
            {
                this.Region = Region.FromHrgn(CreateRoundRectRgn(0, 0, this.Width, this.Height, 24, 24));
            }
            catch { }

            this.MouseDown += (s, e) =>
            {
                if (e.Button == MouseButtons.Left)
                {
                    dragging = true;
                    dragStart = e.Location;
                }
            };
            this.MouseMove += (s, e) =>
            {
                if (dragging)
                {
                    this.Location = new Point(
                        this.Left + e.X - dragStart.X,
                        this.Top + e.Y - dragStart.Y);
                }
            };
            this.MouseUp += (s, e) => { dragging = false; };

            animTimer = new System.Windows.Forms.Timer();
            animTimer.Interval = 30;
            animTimer.Tick += OnAnimTick;
            animTimer.Start();

            this.Shown += (s, e) =>
            {
                Thread worker = new Thread(PrepareAndLaunchApp);
                worker.IsBackground = true;
                worker.Start();
            };
        }

        private void OnAnimTick(object sender, EventArgs e)
        {
            angle = (angle + 6.5f) % 360f;
            tickCount++;
            if (tickCount % 42 == 0)
            {
                msgIndex = (msgIndex + 1) % Messages.Length;
            }

            if (childProcess != null)
            {
                try
                {
                    if (childProcess.HasExited)
                    {
                        this.Close();
                        return;
                    }
                    childProcess.Refresh();
                    if (childProcess.MainWindowHandle != IntPtr.Zero)
                    {
                        childSeenMainWindowTicks++;
                        if (childSeenMainWindowTicks > 4)
                        {
                            this.Close();
                            return;
                        }
                    }
                }
                catch
                {
                    this.Close();
                    return;
                }
            }

            this.Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;

            using (LinearGradientBrush bg = new LinearGradientBrush(
                this.ClientRectangle,
                Color.FromArgb(20, 25, 35),
                Color.FromArgb(13, 16, 23),
                LinearGradientMode.Vertical))
            {
                g.FillRectangle(bg, this.ClientRectangle);
            }

            // Sanfter Hintergrund-Schein hinter dem Logo
            using (GraphicsPath glowPath = new GraphicsPath())
            {
                glowPath.AddEllipse(this.Width / 2 - 70, 18, 140, 110);
                using (PathGradientBrush pgb = new PathGradientBrush(glowPath))
                {
                    pgb.CenterColor = Color.FromArgb(28, 245, 158, 11);
                    pgb.SurroundColors = new Color[] { Color.FromArgb(0, 245, 158, 11) };
                    g.FillPath(pgb, glowPath);
                }
            }

            int cx = this.Width / 2;
            int cy = 78;
            int radius = 38;

            // Dezenter Basisring
            using (Pen ringPen = new Pen(Color.FromArgb(35, 255, 255, 255), 2.2f))
            {
                g.DrawEllipse(ringPen, cx - radius, cy - radius, radius * 2, radius * 2);
            }

            // Animierter Amber-Orbitalbogen
            using (Pen arcPen = new Pen(Color.FromArgb(235, 245, 158, 11), 2.6f))
            {
                arcPen.StartCap = LineCap.Round;
                arcPen.EndCap = LineCap.Round;
                g.DrawArc(arcPen, cx - radius, cy - radius, radius * 2, radius * 2, angle, 96f);
            }

            // App-Icon in der Mitte
            if (logoImage != null)
            {
                int iconSize = 54;
                g.DrawImage(logoImage, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
            }

            // Titel "MultiSpice"
            using (Font titleFont = new Font("Segoe UI", 13.5f, FontStyle.Bold, GraphicsUnit.Point))
            using (SolidBrush titleBrush = new SolidBrush(Color.FromArgb(241, 245, 249)))
            {
                StringFormat sf = new StringFormat { Alignment = StringAlignment.Center };
                g.DrawString("MultiSpice", titleFont, titleBrush, new RectangleF(0, 134, this.Width, 28), sf);
            }

            // Humorvolle Statusmeldung (statt Ladebalken)
            using (Font msgFont = new Font("Segoe UI", 9.25f, FontStyle.Regular, GraphicsUnit.Point))
            using (SolidBrush msgBrush = new SolidBrush(Color.FromArgb(156, 168, 186)))
            {
                StringFormat sf = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };
                g.DrawString(Messages[msgIndex], msgFont, msgBrush, new RectangleF(24, 168, this.Width - 48, 44), sf);
            }

            // Feiner Außenrahmen
            using (Pen borderPen = new Pen(Color.FromArgb(45, 255, 255, 255), 1f))
            {
                g.DrawRectangle(borderPen, 0, 0, this.Width - 1, this.Height - 1);
            }
        }

        private void PrepareAndLaunchApp()
        {
            try
            {
                string selfPath = Application.ExecutablePath;
                long zipOffset = -1;
                string buildId = "1.0.0";

                using (FileStream fs = new FileStream(selfPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    if (fs.Length > 24)
                    {
                        fs.Seek(-24, SeekOrigin.End);
                        byte[] trailer = new byte[24];
                        int read = fs.Read(trailer, 0, 24);
                        if (read == 24)
                        {
                            string magic = Encoding.ASCII.GetString(trailer, 16, 8);
                            if (magic == "MSPORT01")
                            {
                                zipOffset = BitConverter.ToInt64(trailer, 0);
                                long stamp = BitConverter.ToInt64(trailer, 8);
                                buildId = stamp.ToString("x");
                            }
                        }
                    }
                }

                string runtimeRoot = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "MultiSpice",
                    "Runtime-" + buildId);
                string exePath = Path.Combine(runtimeRoot, "MultiSpice.exe");
                string readyMarker = Path.Combine(runtimeRoot, ".extracted.ok");

                if (!File.Exists(exePath) || !File.Exists(readyMarker))
                {
                    if (zipOffset > 0)
                    {
                        if (Directory.Exists(runtimeRoot))
                        {
                            try { Directory.Delete(runtimeRoot, true); } catch { }
                        }
                        Directory.CreateDirectory(runtimeRoot);

                        using (FileStream fs = new FileStream(selfPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        {
                            fs.Seek(zipOffset, SeekOrigin.Begin);
                            using (ZipArchive archive = new ZipArchive(fs, ZipArchiveMode.Read, true))
                            {
                                foreach (ZipArchiveEntry entry in archive.Entries)
                                {
                                    string destPath = Path.Combine(runtimeRoot, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
                                    if (string.IsNullOrEmpty(entry.Name))
                                    {
                                        Directory.CreateDirectory(destPath);
                                        continue;
                                    }
                                    string parentDir = Path.GetDirectoryName(destPath);
                                    if (!string.IsNullOrEmpty(parentDir))
                                    {
                                        Directory.CreateDirectory(parentDir);
                                    }
                                    entry.ExtractToFile(destPath, true);
                                }
                            }
                        }
                        File.WriteAllText(readyMarker, buildId);
                    }
                }

                if (File.Exists(exePath))
                {
                    int myPid = Process.GetCurrentProcess().Id;
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = exePath,
                        Arguments = "--portable-splash-pid=" + myPid,
                        WorkingDirectory = runtimeRoot,
                        UseShellExecute = false
                    };
                    childProcess = Process.Start(psi);
                }
                else
                {
                    this.BeginInvoke((MethodInvoker)delegate { this.Close(); });
                }
            }
            catch
            {
                try { this.BeginInvoke((MethodInvoker)delegate { this.Close(); }); } catch { }
            }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SplashForm());
        }
    }
}
