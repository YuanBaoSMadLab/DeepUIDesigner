using HtmlAgilityPack;
using System;
using System.Text;
using System.Windows.Media;
using System.Xml;

namespace Restless.Converters
{
    /// <summary>
    /// Provides functionality to convert HTML to XAML for use in a FlowDocument.
    /// </summary>
    public class HtmlToXamlConverter
    {
        #region Private
        private string siteBase;
        #endregion

        /************************************************************************/

        #region Public properties
        /// <summary>
        /// Gets the html to be converted.
        /// </summary>
        public string Html
        {
            get;
            private set;
        }

        /// <summary>
        /// Gets the converter options.
        /// </summary>
        public ConverterOptions Options { get; }

        /// <summary>
        /// Gets the block config collection.
        /// </summary>
        public BlockConfigCollection BlockConfig { get; }
        #endregion

        /************************************************************************/

        #region Constructors
        /// <summary>
        /// Creates a new instance of the <see cref="HtmlToXamlConverter"/> class
        /// </summary>
        /// <returns>A new instance of <see cref="HtmlToXamlConverter"/></returns>
        public static HtmlToXamlConverter Create()
        {
            return new HtmlToXamlConverter(new ConverterOptions());
        }

        /// <summary>
        /// Initializes a new instance of the <see cref="HtmlToXamlConverter"/> class
        /// </summary>
        /// <param name="options">Converter options</param>
        /// <returns>A new instance of <see cref="HtmlToXamlConverter"/></returns>
        public static HtmlToXamlConverter Create(ConverterOptions options)
        {
            return new HtmlToXamlConverter(options);
        }

        /// <summary>
        /// Initializes a new instance of the <see cref="HtmlToXamlConverter"/> class
        /// </summary>
        /// <param name="options">Converter options</param>
        private HtmlToXamlConverter(ConverterOptions options)
        {
            ArgumentNullException.ThrowIfNull(options);
            Options = options;
            BlockConfig = new BlockConfigCollection(Options.AddDefaultBlockConfigs);
        }
        #endregion

        /************************************************************************/

        #region Public methods
        /// <summary>
        /// Sets the html to be converted
        /// </summary>
        /// <param name="html">The html</param>
        /// <returns>This instance</returns>
        /// <exception cref="ArgumentException">
        /// <paramref name="html"/> is null or empty
        /// </exception>
        public HtmlToXamlConverter SetHtml(string html)
        {
            ArgumentException.ThrowIfNullOrEmpty(html, nameof(html));
            Html = html;
            return this;
        }

        /// <summary>
        /// Adds (or updates) a <see cref="BlockConfig"/> object to the collection
        /// </summary>
        /// <param name="blockConfig">The block config</param>
        /// <returns>This instance</returns>
        /// <exception cref="ArgumentNullException">
        /// <paramref name="blockConfig"/> is null
        /// </exception>
        /// <remarks>
        /// You can also add and update block config objects via the collection property directly.
        /// This method provides a way to chain calls to the <see cref="HtmlToXamlConverter"/> instance.
        /// </remarks>
        public HtmlToXamlConverter SetBlockConfig(BlockConfig blockConfig)
        {
            ArgumentNullException.ThrowIfNull(blockConfig);
            BlockConfig.Add(blockConfig);
            return this;
        }

        /// <summary>
        /// Converts the html that was specified in the <see cref="SetHtml(string)"/> method.
        /// </summary>
        /// <returns>A XAML string</returns>
        /// <exception cref="ArgumentException">
        /// The <see cref="Html"/> property has not been set.
        /// </exception>
        public string Convert()
        {
            ArgumentException.ThrowIfNullOrEmpty(Html, nameof(Html));

            XmlDocument xamlDoc = new();
            HtmlDocument htmlDoc = new();

            XmlElement xamlTopElement = Options.IsTopLevelFlowDocument ? xamlDoc.AddFlowDocumentElement() : xamlDoc.AddSectionElement();
            if (xamlTopElement.IsNamed(XamlSchema.XamlSection))
            {
                xamlTopElement.ApplyBlockConfig(Options.SectionConfig);
            }

            if (Options.SetPreserve)
            {
                xamlTopElement.SetPreserveSpace();
            }

            htmlDoc.LoadHtml(Html);
            htmlDoc.DocumentNode.RemoveAllCommentNodes();

            // Get the site base if it exists. May be used later to complete relative images
            siteBase = GetSiteBase(htmlDoc.DocumentNode.SelectSingleNode("//head/base"));

            HtmlNode startNode = htmlDoc.DocumentNode.SelectSingleNode("//body") ?? htmlDoc.DocumentNode;

            if (xamlTopElement.IsNamed(XamlSchema.XamlFlowDocument) && startNode.FirstChild?.GetHtmlElementType() != HtmlElementType.Section)
            {
                xamlTopElement = xamlTopElement.AddSectionElement();
                xamlTopElement.ApplyBlockConfig(Options.SectionConfig);
            }

            WalkNodes(startNode, xamlTopElement);

            XmlWriterSettings xmlWriterSettings = new()
            {
                Indent = Options.IsOutputIndented,
                OmitXmlDeclaration = true,
            };

            StringBuilder builder = new();
            xamlDoc.Save(XmlWriter.Create(builder, xmlWriterSettings));
            return builder.ToString();
        }
        #endregion

        /************************************************************************/

        #region Private methods (Main)
        private void WalkNodes(HtmlNode parentNode, XmlElement xamlElement)
        {
            foreach (HtmlNode node in parentNode.ChildNodes)
            {
                if (node.NodeType == HtmlNodeType.Element)
                {
                    ProcessElementNode(node, xamlElement);
                }

                if (node.NodeType == HtmlNodeType.Text)
                {
                    ProcessTextNode(node, xamlElement);
                }
            }
        }

        private void ProcessElementNode(HtmlNode node, XmlElement parent)
        {
            switch (node.GetHtmlElementType())
            {
                case HtmlElementType.Section:
                    ProcessSectionElement(node, parent);
                    break;
                case HtmlElementType.Paragraph:
                    ProcessParagraphElement(node, parent);
                    break;
                case HtmlElementType.Inline:
                    ProcessInlineElement(node, parent);
                    break;
                case HtmlElementType.List:
                    ProcessListElement(node, parent);
                    break;
                case HtmlElementType.ListItem:
                    ProcessListItemElement(node, parent);
                    break;
                case HtmlElementType.Table:
                    ProcessTableElement(node, parent);
                    break;
                case HtmlElementType.TableItem:
                    ProcessTableItemElement(node, parent);
                    break;
                case HtmlElementType.Image:
                    ProcessImageElement(node, parent);
                    break;
                case HtmlElementType.Unknown:
                    ProcessUnknownElement(node, parent);
                    break;
            }
        }

        private static void ProcessTextNode(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsText())
            {
                parent.AddChildText(node.GetCleanInnerText());
            }
            else if (parent.AcceptsParagraph() && !node.IsEmptyText())
            {
                parent.AddParagraphElement().AddChildText(node.GetCleanInnerText());
            }

        }
        #endregion

        /************************************************************************/

        #region Private methods (Section, paragraph, inline)
        private void ProcessSectionElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsSection())
            {
                if (node.HasOnlyText())
                {
                    XmlElement paragraph = parent.AddParagraphElement().AddChildText(node.GetCleanInnerText());
                    ApplyBlockConfig(node, paragraph);
                }
                else
                {
                    XmlElement section = parent.AddSectionElement();
                    section.ApplyBlockConfig(Options.SectionConfig);
                    WalkNodes(node, section);
                }
            }
        }

        private void ProcessParagraphElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsParagraph())
            {
                XmlElement paragraph = parent.AddParagraphElement();
                ApplyBlockConfig(node, paragraph);
                if (node.HasOnlyText())
                {
                    paragraph.AddChildText(node.GetCleanInnerText());
                }
                else
                {
                    WalkNodes(node, paragraph);
                }
            }
        }

        private void ProcessInlineElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsInline())
            {
                ProcessAcceptedInlineElement(node, parent);
            }
            else if (parent.AcceptsParagraph())
            {
                XmlElement paragraph = parent.AddParagraphElement();
                ProcessAcceptedInlineElement(node, paragraph);
            }
        }

        private void ProcessAcceptedInlineElement(HtmlNode node, XmlElement parent)
        {
            switch (node.Name)
            {
                case HtmlSchema.HtmlAnchor:
                    XmlElement link = parent.AddHyperlinkElement().SetNavigateUri(node);
                    WalkNodes(node, link);
                    break;
                case HtmlSchema.HtmlBold:
                case HtmlSchema.HtmlStrong:
                    XmlElement bold = parent.AddBoldElement();
                    WalkNodes(node, bold);
                    break;
                case HtmlSchema.HtmlItalic:
                case HtmlSchema.HtmlEmphasis:
                    XmlElement italic = parent.AddItalicElement();
                    WalkNodes(node, italic);
                    break;
                case HtmlSchema.HtmlCode:
                case HtmlSchema.HtmlSpan:
                    XmlElement span = parent.AddSpanElement();
                    WalkNodes(node, span);
                    break;
                case HtmlSchema.HtmlLineBreak:
                    parent.AddLineBreakElement();
                    break;
                default:
                    break;
            }
        }
        #endregion

        /************************************************************************/

        #region Private methods (List)
        private void ProcessListElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsList())
            {
                XmlElement list = parent.AddListElement().AddListMarkerStyle(node.Name);
                ApplyBlockConfig(node, list);
                WalkNodes(node, list);
            }
        }

        private void ProcessListItemElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsListItem())
            {
                XmlElement listItem = parent.AddListItemElement();
                if (node.HasOnlyText())
                {
                    listItem.AddParagraphElement().AddChildText(node.GetCleanInnerText());
                }
                else
                {
                    WalkNodes(node, listItem);
                }
            }
        }
        #endregion

        /************************************************************************/

        #region Private methods (Table)
        /// <summary>
        /// https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/how-to-define-a-table-with-xaml?view=netframeworkdesktop-4.8
        /// </summary>
        private void ProcessTableElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsTable())
            {
                XmlElement table = parent.AddTableElement();
                ApplyBlockConfig(node, table);
                WalkNodes(node, table);
            }
        }

        private void ProcessTableItemElement(HtmlNode node, XmlElement parent)
        {
            switch (node.Name)
            {
                case HtmlSchema.HtmlTableHead:
                case HtmlSchema.HtmlTableBody:
                case HtmlSchema.HtmlTableFooter:
                    ProcessTableRowGroupElement(node, parent);
                    break;
                case HtmlSchema.HtmlTableRow:
                    ProcessTableRowElement(node, parent);
                    break;
                case HtmlSchema.HtmlTableHeadCell:
                case HtmlSchema.HtmlTableCell:
                    ProcessTableCellElement(node, parent);
                    break;
            }
        }

        private void ProcessTableRowGroupElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsTableRowGroup())
            {
                XmlElement tableRowGroup = parent.AddTableRowGroupElement();
                WalkNodes(node, tableRowGroup);
            }
        }

        private void ProcessTableRowElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsTableRow())
            {
                XmlElement tableRow = parent.AddTableRowElement();
                WalkNodes(node, tableRow);
            }
            else if (parent.AcceptsTableRowGroup())
            {
                XmlElement tableRow = parent.AddTableRowGroupElement().AddTableRowElement();
                WalkNodes(node, tableRow);
            }
        }

        private void ProcessTableCellElement(HtmlNode node, XmlElement parent)
        {
            if (parent.AcceptsTableCell())
            {
                XmlElement tableCell = parent.AddTableCellElement();
                ApplyBlockConfig(node, tableCell);
                tableCell.SetColumnSpan(node);
                tableCell.SetRowSpan(node);
                WalkNodes(node, tableCell);
            }
        }
        #endregion

        /************************************************************************/

        #region Private methods (Image)
        private void ProcessImageElement(HtmlNode node, XmlElement parent)
        {
            if (node.GetImageSource() is string imgSource)
            {
                imgSource = GetCompleteImageSource(imgSource);

                if (parent.AcceptsInline())
                {
                    ProcessImageContainerElement(node, parent.AddInlineUIContainerElement(), imgSource);
                }
                else if (parent.AcceptsBlock())
                {
                    ProcessImageContainerElement(node, parent.AddBlockUIContainerElement(), imgSource);
                }
            }
        }

        private void ProcessImageContainerElement(HtmlNode node, XmlElement container, string imgSource)
        {
            XmlElement image = container.AddImageElement().SetSource(imgSource);
            ApplyBlockConfig(node, image);
        }

        private string GetCompleteImageSource(string imgSource)
        {
            if (!imgSource.IsValidUri() && !string.IsNullOrEmpty(siteBase))
            {
                if (imgSource.StartsWith("/"))
                {
                    imgSource = imgSource[1..];
                }
                // siteBase always ends with a slash. See GetSiteBase() below
                return $"{siteBase}{imgSource}";
            }
            return imgSource;
        }
        #endregion

        /************************************************************************/

        #region Private methods
        private void ProcessUnknownElement(HtmlNode node, XmlElement parent)
        {
            if (Options.ProcessUnknown)
            {
                if (parent.IsNamed(XamlSchema.XamlParagraph))
                {
                    AddUnknownToParagraph(node, parent);
                }

                if (parent.IsNamed(XamlSchema.XamlSection))
                {
                    AddUnknownToParagraph(node, parent.AddParagraphElement());
                }
            }
        }

        private static void AddUnknownToParagraph(HtmlNode node, XmlElement parent)
        {
            XmlElement span = parent.AddSpanElement().SetForeground(Brushes.Red);
            span.AddRunElement().AddChildText("[Unknown node ");
            span.AddRunElement().SetBold().AddChildText(node.Name);
            span.AddRunElement().AddChildText(", inner text: ");
            span.AddRunElement().AddChildText(node.InnerText);
            span.AddRunElement().AddChildText("]");
        }
        #endregion

        /************************************************************************/

        #region Private methods (other)
        private void ApplyBlockConfig(HtmlNode node, XmlElement element)
        {
            if (BlockConfig.Get(node.Name) is BlockConfig blockConfig)
            {
                element.ApplyBlockConfig(blockConfig);
            }
        }

        private static string GetSiteBase(HtmlNode baseNode)
        {
            if (baseNode != null && baseNode.Attributes[HtmlSchema.HtmlHref] is HtmlAttribute attrib)
            {
                string baseStr = attrib.Value;
                if (!baseStr.EndsWith("/"))
                {
                    baseStr += "/";
                }
                return baseStr;
            }
            return null;
        }
        #endregion
    }
}