using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media.Imaging;

namespace Restless.Converters
{
    /// <summary>
    /// Provides functionality to intercept paste (and drag/drop) operations
    /// in order to convert incoming html to xaml and to resize incoming images.
    /// </summary>
    public class PasteHandler
    {
        #region Properties
        /// <summary>
        /// Gets the options that affect the behavior of this instance
        /// </summary>
        public PasteHandlerOptions Options { get; }

        /// <summary>
        /// Gets the <see cref="HtmlToXamlConverter"/> used to convert incoming html
        /// </summary>
        public HtmlToXamlConverter Converter { get; }
        #endregion

        /************************************************************************/

        #region Constructors
        /// <summary>
        /// Registers the specified element and returns a new instance of <see cref="PasteHandler"/>
        /// </summary>
        /// <param name="element">The element to handle.</param>
        /// <returns>A new instance of <see cref="PasteHandler"/></returns>
        public static PasteHandler Register(TextBoxBase element)
        {
            return new PasteHandler(element, new PasteHandlerOptions());
        }

        /// <summary>
        /// Registers the specified element and returns a new instance of <see cref="PasteHandler"/>
        /// </summary>
        /// <param name="element">The element to handle.</param>
        /// <param name="options">The paste handler options</param>
        /// <returns>A new instance of <see cref="PasteHandler"/></returns>
        public static PasteHandler Register(TextBoxBase element, PasteHandlerOptions options)
        {
            return new PasteHandler(element, options);
        }

        private PasteHandler(TextBoxBase element, PasteHandlerOptions options)
        {
            ArgumentNullException.ThrowIfNull(element, nameof(element));
            ArgumentNullException.ThrowIfNull(options, nameof(options));

            Options = options;
            Converter = HtmlToXamlConverter.Create();

            DataObject.AddPastingHandler(element, OnPaste);

            if (Options.HtmlPasteAction == HtmlPasteAction.Auto)
            {
                if (element is TextBox)
                {
                    Options.HtmlPasteAction = HtmlPasteAction.None;
                }

                if (element is RichTextBox)
                {
                    Options.HtmlPasteAction = HtmlPasteAction.ConvertToXaml;
                }
            }

        }
        #endregion

        /************************************************************************/

        #region Private methods
        private void OnPaste(object sender, DataObjectPastingEventArgs e)
        {
            //ExamineDataObject(e.DataObject);
            DataObject dataObject = (DataObject)e.DataObject;
            TryHandleImageData(dataObject, e);
            TryHandleHtmlData(dataObject, e);
        }

        private void TryHandleImageData(DataObject dataObject, DataObjectPastingEventArgs e)
        {
            if (!e.Handled && dataObject.ContainsImage() && dataObject.GetImage() is BitmapSource bitmapSource)
            {
                double largestDimension = Math.Max(bitmapSource.Width, bitmapSource.Height);
                if (largestDimension > Options.MaxImageDimension)
                {
                    double scale = Options.MaxImageDimension / largestDimension;
                    if (ToBitmap(bitmapSource) is Bitmap bitmap)
                    {
                        Bitmap resizedBitmap = new(bitmap, new System.Drawing.Size((int)(bitmap.Width * scale), (int)(bitmap.Height * scale)));
                        if (ToBitmapSource(resizedBitmap) is BitmapSource resizedBitmapSource)
                        {
                            DataObject newDataObject = new();
                            newDataObject.SetImage(resizedBitmapSource);
                            e.DataObject = newDataObject;
                        }
                    }
                }
                e.Handled = true;
            }
        }

        private void TryHandleHtmlData(DataObject dataObject, DataObjectPastingEventArgs e)
        {
            if (!e.Handled && dataObject.GetHtml() is string html && Options.HtmlPasteAction != HtmlPasteAction.None)
            {
                HtmlPasteItem item = new(html);
                if (item.HasFragment)
                {
                    DataObject obj = new();

                    string fragment = GetFragment(item);
                    string attribution = GetSourceAttribution(item);

                    switch (Options.HtmlPasteAction)
                    {
                        case HtmlPasteAction.ConvertToText:
                            obj.SetText(fragment + attribution);
                            break;
                        case HtmlPasteAction.ConvertToXaml:
                        case HtmlPasteAction.ConvertToXamlText:
                            string xaml = Converter.SetHtml(fragment + attribution).Convert();
                            string format = Options.HtmlPasteAction == HtmlPasteAction.ConvertToXaml ? DataFormats.Xaml : DataFormats.Text;
                            obj.SetData(format, xaml);
                            break;
                        default:
                            throw new InvalidOperationException("Invalid paste action");
                    }

                    e.DataObject = obj;
                    e.Handled = true;
                }
            }
        }

        private string GetFragment(HtmlPasteItem item)
        {
            if (Options.WrapPartialFragment && item.Fragment.EndsWith("</span>", StringComparison.InvariantCultureIgnoreCase))
            {
                return $"<div>{item.Fragment}</div>";
            }
            return item.Fragment;
        }

        private static string GetSourceAttribution(HtmlPasteItem item)
        {
            if (item.HasSourceUrl && item.SourceUrl.IsValidUri())
            {
                return $"<p>Pasted from <a href=\"{item.SourceUrl}\">{item.SourceUrl}</a></p>";
            }

            return string.Empty;
        }
        #endregion

        /************************************************************************/

        #region Private methods (debug helper)
        [System.Diagnostics.CodeAnalysis.SuppressMessage("CodeQuality", "IDE0051:Remove unused private members", Justification = "<Pending>")]
        private static void ExamineDataObject(IDataObject dataObject)
        {
            DataObject data = (DataObject)dataObject;
            Debug.WriteLine($"Contains html: {data.ContainsHtml()}");
            Debug.WriteLine($"Contains image: {data.ContainsImage()}");
            Debug.WriteLine($"Contains text: {data.ContainsText()}");
            Debug.WriteLine($"Contains audio: {data.ContainsAudio()}");
            Debug.WriteLine($"Contains file drop list: {data.ContainsFileDropList()}");

            foreach (string format in data.GetFormats())
            {
                try
                {
                    Debug.WriteLine(format);
                    Debug.WriteLine("--------Start");
                    var payload = dataObject.GetData(format);
                    Debug.WriteLine(payload);
                    Debug.WriteLine("---------End");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine(ex.Message);
                }
            }
        }
        #endregion

        /************************************************************************/

        #region Private methods (Bitmap conversion)
        // https://stackoverflow.com/questions/2284353/is-there-a-good-way-to-convert-between-bitmapsource-and-bitmap
        private static BitmapSource ToBitmapSource(Bitmap bitmap)
        {
            return System.Windows.Interop.Imaging.CreateBitmapSourceFromHBitmap(
                          bitmap.GetHbitmap(),
                          IntPtr.Zero,
                          Int32Rect.Empty,
                          BitmapSizeOptions.FromEmptyOptions());
        }

        private static Bitmap ToBitmap(BitmapSource bitmapsource)
        {
            Bitmap bitmap;
            using (MemoryStream outStream = new())
            {
                BitmapEncoder enc = new BmpBitmapEncoder();
                enc.Frames.Add(BitmapFrame.Create(bitmapsource));
                enc.Save(outStream);
                bitmap = new Bitmap(outStream);
            }
            return bitmap;
        }
        #endregion
    }

    #region Helper class
    internal static class Helper
    {
        internal static bool ContainsHtml(this DataObject data) => data.GetDataPresent(DataFormats.Html);
        internal static string GetHtml(this DataObject data) => data.ContainsHtml() ? data.GetData(DataFormats.Html) as string : null;
    }
    #endregion
}