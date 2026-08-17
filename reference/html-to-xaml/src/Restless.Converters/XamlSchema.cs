using HtmlAgilityPack;
using System;
using System.Linq;
using System.Windows;
using System.Windows.Media;
using System.Xml;

namespace Restless.Converters
{
    /// <summary>
    /// Provides XAML definitions and extension methods
    /// </summary>
    internal static class XamlSchema
    {
        #region Element Arrays (Private)
        private static readonly string[] AcceptsBlockConfigElements = { XamlBlockUIContainer, XamlList, XamlParagraph, XamlSection, XamlTable, XamlTableCell };

        private static readonly string[] AcceptsBlockElements = { XamlSection, XamlListItem, XamlTableCell };
        private static readonly string[] AcceptsSectionElements = { XamlFlowDocument, XamlSection };
        private static readonly string[] AcceptsParagraphElements = { XamlSection, XamlListItem, XamlTableCell };

        private static readonly string[] AcceptsTableElements = { XamlSection, XamlListItem, XamlTableCell };
        private static readonly string[] AcceptsTableRowGroupElements = { XamlTable };
        private static readonly string[] AcceptsTableRowElements = { XamlTableRowGroup };
        private static readonly string[] AcceptsTableCellElements = { XamlTableRow };

        private static readonly string[] AcceptsListElements = { XamlSection, XamlListItem, XamlTableCell };
        private static readonly string[] AcceptsListItemElements = { XamlList };

        private static readonly string[] AcceptsInlineElements = { XamlParagraph, XamlBold, XamlHyperlink, XamlItalic, XamlSpan, XamlUnderline };
        private static readonly string[] AcceptsTextElements = { XamlParagraph, XamlBold, XamlHyperlink, XamlItalic, XamlRun, XamlSpan, XamlUnderline };
        #endregion

        /************************************************************************/

        #region Xaml (Defs)
        internal const string XamlNamespace = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
        internal const string XamlFlowDocument = "FlowDocument";
        internal const string XamlSection = "Section";
        internal const string XamlParagraph = "Paragraph";
        internal const string XamlSpan = "Span";
        internal const string XamlRun = "Run";
        internal const string XamlBold = "Bold";
        internal const string XamlItalic = "Italic";
        internal const string XamlHyperlink = "Hyperlink";
        internal const string XamlUnderline = "Underline";
        internal const string XamlLineBreak = "LineBreak";

        internal const string XamlImage = "Image";
        internal const string XamlSource = "Source";
        internal const string XamlStretch = "Stretch";
        internal const string XamlStretchNone = "None";

        internal const string XamlList = "List";
        internal const string XamlListItem = "ListItem";
        internal const string XamlListMarkerStyle = "MarkerStyle";
        internal const string XamlListMarkerStyleNone = "None";
        internal const string XamlListMarkerStyleDecimal = "Decimal";
        internal const string XamlListMarkerStyleDisc = "Disc";
        internal const string XamlListMarkerStyleCircle = "Circle";
        internal const string XamlListMarkerStyleSquare = "Square";
        internal const string XamlListMarkerStyleBox = "Box";

        internal const string XamlTable = "Table";
        internal const string XamlTableCellSpacing = "CellSpacing";
        internal const string XamlTableColumnGroup = "Table.Columns";
        internal const string XamlTableColumn = "TableColumn";
        internal const string XamlTableRowGroup = "TableRowGroup";
        internal const string XamlTableRow = "TableRow";
        internal const string XamlTableCell = "TableCell";
        internal const string XamlTableCellColumnSpan = "ColumnSpan";
        internal const string XamlTableCellRowSpan = "RowSpan";

        internal const string XamlBlockUIContainer = "BlockUIContainer";
        internal const string XamlInlineUIContainer = "InlineUIContainer";

        internal const string XamlHeight = "Height";
        internal const string XamlWidth = "Width";
        internal const string XamlFontSize = "FontSize";
        internal const string XamlFontStyle = "FontStyle";
        internal const string XamlFontStyleItalic = "Italic";
        internal const string XamlFontWeight = "FontWeight";
        internal const string XamlFontWeightBold = "Bold";
        internal const string XamlTextAlignment = "TextAlignment";
        internal const string XamlHorizontalAlignment = "HorizontalAlignment";
        internal const string XamlBackground = "Background";
        internal const string XamlForeground = "Foreground";
        internal const string XamlBorderBrush = "BorderBrush";
        internal const string XamlBorderThickness = "BorderThickness";
        internal const string XamlPadding = "Padding";
        internal const string XamlNavigateUri = "NavigateUri";
        #endregion

        /************************************************************************/

        #region Extension Methods (XAML)
        internal static XmlElement AddFlowDocumentElement(this XmlNode parent) => AddChildElement(parent, XamlFlowDocument);
        internal static XmlElement AddSectionElement(this XmlNode parent) => AddChildElement(parent, XamlSection);
        internal static XmlElement AddParagraphElement(this XmlNode parent) => AddChildElement(parent, XamlParagraph);
        internal static XmlElement AddSpanElement(this XmlNode parent) => AddChildElement(parent, XamlSpan);
        internal static XmlElement AddRunElement(this XmlNode parent) => AddChildElement(parent, XamlRun);
        internal static XmlElement AddBoldElement(this XmlNode parent) => AddChildElement(parent, XamlBold);
        internal static XmlElement AddItalicElement(this XmlNode parent) => AddChildElement(parent, XamlItalic);
        internal static XmlElement AddLineBreakElement(this XmlNode parent) => AddChildElement(parent, XamlLineBreak);

        internal static XmlElement AddHyperlinkElement(this XmlNode parent) => AddChildElement(parent, XamlHyperlink);
        internal static XmlElement AddImageElement(this XmlNode parent) => AddChildElement(parent, XamlImage);

        internal static XmlElement AddListElement(this XmlNode parent) => AddChildElement(parent, XamlList);
        internal static XmlElement AddListItemElement(this XmlNode parent) => AddChildElement(parent, XamlListItem);
        internal static XmlElement AddTableElement(this XmlNode parent) => AddChildElement(parent, XamlTable);

        internal static XmlElement AddTableColumnGroupElement(this XmlNode parent) => AddChildElement(parent, XamlTableColumnGroup);
        internal static XmlElement AddTableColumnElement(this XmlNode parent) => AddChildElement(parent, XamlTableColumn);
        internal static XmlElement AddTableRowGroupElement(this XmlNode parent) => AddChildElement(parent, XamlTableRowGroup);
        internal static XmlElement AddTableRowElement(this XmlNode parent) => AddChildElement(parent, XamlTableRow);
        internal static XmlElement AddTableCellElement(this XmlNode parent) => AddChildElement(parent, XamlTableCell);

        internal static XmlElement AddBlockUIContainerElement(this XmlNode parent) => AddChildElement(parent, XamlBlockUIContainer);
        internal static XmlElement AddInlineUIContainerElement(this XmlNode parent) => AddChildElement(parent, XamlInlineUIContainer);

        internal static XmlElement AddListMarkerStyle(this XmlElement parent, string htmlName)
        {
            string attribValue =
                htmlName == HtmlSchema.HtmlOrderedList ? XamlListMarkerStyleDecimal :
                htmlName == HtmlSchema.HtmlUnorderedList ? XamlListMarkerStyleBox : XamlListMarkerStyleNone;

            parent.SetAttribute(XamlListMarkerStyle, attribValue);

            return parent;
        }

        internal static XmlElement SetPreserveSpace(this XmlElement parent)
        {
            parent.SetAttribute("xml:space", "preserve");
            return parent;
        }

        internal static XmlElement SetHeight(this XmlElement parent, double height)
        {
            parent.SetAttribute(XamlHeight, Math.Max(0, height).ToString());
            return parent;
        }

        internal static XmlElement SetForeground(this XmlElement parent, Brush brush)
        {
            if (brush is not null)
            {
                parent.SetAttribute(XamlForeground, brush.ToString());
            }
            return parent;
        }

        internal static XmlElement SetBold(this XmlElement parent)
        {
            parent.SetAttribute(XamlFontWeight, XamlFontWeightBold);
            return parent;
        }

        internal static XmlElement SetItalic(this XmlElement parent)
        {
            parent.SetAttribute(XamlFontStyle, XamlFontStyleItalic);
            return parent;
        }

        internal static XmlElement SetSource(this XmlElement parent, string source)
        {
            if (source.IsValidUri())
            {
                parent.SetAttribute(XamlSource, source);
            }
            return parent;
        }

        internal static XmlElement SetStretch(this XmlElement parent, Stretch stretch)
        {
            parent.SetAttribute(XamlStretch, stretch.ToString());
            return parent;
        }

        internal static XmlElement SetNavigateUri(this XmlElement parent, HtmlNode node)
        {
            if (node.Attributes[HtmlSchema.HtmlHref] is HtmlAttribute attrib && attrib.Value.IsValidUri())
            {
                parent.SetAttribute(XamlNavigateUri, attrib.Value);
            }
            return parent;
        }

        private static XmlElement AddChildElement(this XmlNode parent, string elementName)
        {
            XmlElement childElement = GetCreator(parent).CreateElement
                (
                    qualifiedName: elementName, XamlNamespace
                );
            parent.AppendChild(childElement);
            return childElement;
        }

        internal static XmlElement AddChildText(this XmlElement parent, string text)
        {
            XmlText child = parent.GetCreator().CreateTextNode(text);
            parent.AppendChild(child);
            return parent;
        }

        internal static void SetColumnSpan(this XmlElement cell, HtmlNode node)
        {
            if (cell.IsNamed(XamlTableCell) && node.Attributes[HtmlSchema.HtmlTableColSpan] is HtmlAttribute attrib)
            {
                if (int.TryParse(attrib.Value, out int result))
                {
                    cell.SetAttribute(XamlTableCellColumnSpan, result.ToString());
                }
            }
        }

        internal static void SetRowSpan(this XmlElement cell, HtmlNode node)
        {
            if (cell.IsNamed(XamlTableCell) && node.Attributes[HtmlSchema.HtmlTableRowSpan] is HtmlAttribute attrib)
            {
                if (int.TryParse(attrib.Value, out int result))
                {
                    cell.SetAttribute(XamlTableCellRowSpan, result.ToString());
                }
            }
        }

        internal static void ApplyBlockConfig(this XmlElement element, BlockConfig blockConfig)
        {
            if (element.AcceptsBlockConfig())
            {
                element.SetAttribute(XamlFontSize, blockConfig.FontSize.ToString());

                if (blockConfig.FontWeight != FontWeights.Normal)
                {
                    element.SetAttribute(XamlFontWeight, blockConfig.FontWeight.ToString());
                }

                if (blockConfig.TextAlignment != TextAlignment.Left)
                {
                    element.SetAttribute(XamlTextAlignment, blockConfig.TextAlignment.ToString());
                }

                if (blockConfig.Foreground is not null)
                {
                    element.SetAttribute(XamlForeground, blockConfig.Foreground.ToString());
                }

                if (blockConfig.Background is not null)
                {
                    element.SetAttribute(XamlBackground, blockConfig.Background.ToString());
                }

                if (blockConfig.BorderBrush != null)
                {
                    element.SetAttribute(XamlBorderBrush, blockConfig.BorderBrush.ToString());
                }

                if (!blockConfig.BorderThickness.IsZero())
                {
                    element.SetAttribute(XamlBorderThickness, blockConfig.BorderThickness.ToString());
                }

                if (!blockConfig.Padding.IsZero())
                {
                    element.SetAttribute(XamlPadding, blockConfig.Padding.ToString());
                }

                if (element.IsNamed(XamlTable) && !double.IsNaN(blockConfig.Spacing))
                {
                    element.SetAttribute(XamlTableCellSpacing, blockConfig.Spacing.ToString());
                }
            }

            if (element.IsNamed(XamlImage))
            {
                element.SetAttribute(XamlHorizontalAlignment, blockConfig.HorizontalAlignment.ToString());
            }
        }

        private static XmlDocument GetCreator(this XmlNode node) => node.NodeType == XmlNodeType.Document ? node as XmlDocument : node.OwnerDocument;
        private static bool IsZero(this Thickness t) => t.Bottom == 0 && t.Left == 0 && t.Right == 0 && t.Top == 0;
        private static bool AcceptsBlockConfig(this XmlNode node) => AcceptsBlockConfigElements.Contains(node.Name);

        internal static bool IsNamed(this XmlNode node, string name) => node.Name == name;

        internal static bool AcceptsSection(this XmlNode node) => AcceptsSectionElements.Contains(node.Name);
        internal static bool AcceptsParagraph(this XmlNode node) => AcceptsParagraphElements.Contains(node.Name);
        internal static bool AcceptsTable(this XmlNode node) => AcceptsTableElements.Contains(node.Name);
        internal static bool AcceptsTableRowGroup(this XmlNode node) => AcceptsTableRowGroupElements.Contains(node.Name);
        internal static bool AcceptsTableRow(this XmlNode node) => AcceptsTableRowElements.Contains(node.Name);
        internal static bool AcceptsTableCell(this XmlNode node) => AcceptsTableCellElements.Contains(node.Name);
        internal static bool AcceptsList(this XmlNode node) => AcceptsListElements.Contains(node.Name);
        internal static bool AcceptsListItem(this XmlNode node) => AcceptsListItemElements.Contains(node.Name);
        internal static bool AcceptsBlock(this XmlNode node) => AcceptsBlockElements.Contains(node.Name);
        internal static bool AcceptsInline(this XmlNode node) => AcceptsInlineElements.Contains(node.Name);
        internal static bool AcceptsText(this XmlNode node) => AcceptsTextElements.Contains(node.Name);
        #endregion
    }
}