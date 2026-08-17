using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Restless.Converters.Demo
{
    /// <summary>
    /// Interaction logic for MainWindow.xaml
    /// </summary>
    public partial class MainWindow : Window
    {
        private TestConfiguration testConfig;
        private const string JsonFileName = @"D:\Development\Visual_Studio\Projects\Restless.Converters\.docs\test.files.json";
        private static readonly string DataFormat = DataFormats.XamlPackage;

        public MainWindow()
        {
            InitializeComponent();
            PasteHandler.Register(Rich);
            PasteHandler.Register(TextBoxHtml, new PasteHandlerOptions(HtmlPasteAction.ConvertToText));
            AddHandler(Hyperlink.RequestNavigateEvent, new RoutedEventHandler(OnNavigationRequest));
            LoadTestConfiguration();
        }

        private void OnNavigationRequest(object sender, RoutedEventArgs e)
        {
            if (e.OriginalSource is Hyperlink source && source.NavigateUri.ToString().IsValidUri())
            {
                Process.Start(new ProcessStartInfo()
                {
                    FileName = source.NavigateUri.ToString(),
                    UseShellExecute = true,
                });
            }
        }

        private void ButtonSaveRichTextClick(object sender, RoutedEventArgs e)
        {
            if (testConfig?.SaveFile is string saveFile)
            {
                SaveRichTextBoxToFile(saveFile);
            }
        }

        private void ButtonLoadRichTextClick(object sender, RoutedEventArgs e)
        {
            if (testConfig?.SaveFile is string saveFile)
            {
                if (File.Exists(saveFile))
                {
                    LoadRichTextBoxFromFile(saveFile);
                }
                else
                {
                    Rich.AppendText("File not found");
                }
            }
        }

        private void LoadRichTextBoxFromFile(string fileName)
        {
            try
            {
                using (FileStream fileStream = new(fileName, FileMode.OpenOrCreate))
                {
                    TextRange range = new(Rich.Document.ContentStart, Rich.Document.ContentEnd);
                    range.Load(fileStream, DataFormat);
                }
            }
            catch (Exception)
            {
                Rich.AppendText("File is not right format or is corrupted");
            }
        }

        private void SaveRichTextBoxToFile(string fileName)
        {
            using (FileStream fileStream = new(fileName, FileMode.Create))
            {
                TextRange range = new(Rich.Document.ContentStart, Rich.Document.ContentEnd);
                range.Save(fileStream, DataFormat);
            }
        }

        private void ButtonAdjustImagesClick(object sender, RoutedEventArgs e)
        {
            Rich.Document.Discover<Image>(img =>
            {
                if (img.Source is BitmapSource source)
                {
                    img.Height = source.PixelHeight;
                }
            });
        }

        private void ButtonLoadHtmlClick(object sender, RoutedEventArgs e)
        {
            if (testConfig?.LoadFile is string loadFile)
            {
                if (File.Exists(loadFile))
                {
                    TextBoxHtml.Text = File.ReadAllText(loadFile);
                }
                else
                {
                    TextBoxHtml.Text = $"{loadFile} - File not found";
                }
            }
        }

        private void ButtonConvertClick(object sender, RoutedEventArgs e)
        {
            if (TextBoxHtml.Text.Length > 0)
            {
                TextBoxXaml.Text = HtmlToXamlConverter.Create(new ConverterOptions()
                {
                    ProcessUnknown = true
                }).SetBlockConfig(new BlockConfig("img")
                {
                    HorizontalAlignment = HorizontalAlignment.Right
                }).SetHtml(TextBoxHtml.Text).Convert();
            }
        }

        [DebuggerHidden]
        private void ButtonToRichClick(object sender, RoutedEventArgs e)
        {
            if (TextBoxXaml.Text.Length > 0)
            {
                TryLoadRichTextBox();
            }
        }

        [DebuggerHidden]
        private void TryLoadRichTextBox()
        {
            try
            {
                using (MemoryStream mem = new(Encoding.UTF8.GetBytes(TextBoxXaml.Text)))
                {
                    TextRange range = new(Rich.Document.ContentStart, Rich.Document.ContentEnd);
                    range.Load(mem, DataFormats.Xaml);
                }
            }
            catch (Exception ex)
            {
                Rich.AppendText(ex.Message);
            }
        }

        private void ButtonClearHtmlClick(object sender, RoutedEventArgs e)
        {
            TextBoxHtml.Clear();
        }

        private void LoadTestConfiguration()
        {
            if (File.Exists(JsonFileName))
            {
                string json = File.ReadAllText(JsonFileName);
                testConfig = JsonSerializer.Deserialize<TestConfiguration>(json);
            }
        }

        private class TestConfiguration
        {
            [JsonPropertyName("loadfile")]
            public string LoadFile { get; set; }

            [JsonPropertyName("savefile")]
            public string SaveFile { get; set; }
        }
    }
}