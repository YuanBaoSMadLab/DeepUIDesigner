using HtmlAgilityPack;
using System.Collections.Generic;
using System.Linq;

namespace Restless.Converters
{
    /// <summary>
    /// Provides HTML definitions and extension methods
    /// </summary>
    internal static class HtmlSchema
    {
        #region Element Arrays (Private)
        private static readonly string[] SectionBlocks = { HtmlMain, HtmlDiv, HtmlSection, HtmlHeader, HtmlFigure, HtmlFigureCaption, HtmlFooter };
        private static readonly string[] ParagraphBlocks = { HtmlHeader1, HtmlHeader2, HtmlHeader3, HtmlHeader4, HtmlHeader5, HtmlHeader6, HtmlParagraph, HtmlPre };
        private static readonly string[] InlineElements = { HtmlAnchor, HtmlBold, HtmlCode, HtmlEmphasis, HtmlItalic, HtmlLineBreak, HtmlSpan, HtmlStrong };
        private static readonly string[] ListElements = { HtmlOrderedList, HtmlUnorderedList };
        private static readonly string[] ListItemElements = { HtmlListItem };
        private static readonly string[] TableElements = { HtmlTable };
        private static readonly string[] TableItemElements = { HtmlTableHead, HtmlTableBody, HtmlTableFooter, HtmlTableRow, HtmlTableHeadCell, HtmlTableCell };
        private static readonly string[] IgnoredElements = { "head", "meta", "link", "script", "nav", "button" };
        private static readonly string[] ImageElements = { HtmlImage };
        #endregion

        /************************************************************************/

        #region Html (Defs)
        internal const string HtmlMain = "main";
        internal const string HtmlSection = "section";
        internal const string HtmlDiv = "div";
        internal const string HtmlHeader = "header";
        internal const string HtmlFooter = "footer";
        internal const string HtmlFigure = "figure";
        internal const string HtmlFigureCaption = "figcaption";

        internal const string HtmlHeader1 = "h1";
        internal const string HtmlHeader2 = "h2";
        internal const string HtmlHeader3 = "h3";
        internal const string HtmlHeader4 = "h4";
        internal const string HtmlHeader5 = "h5";
        internal const string HtmlHeader6 = "h6";
        internal const string HtmlParagraph = "p";
        internal const string HtmlPre = "pre";

        internal const string HtmlBold = "b";
        internal const string HtmlStrong = "strong";
        internal const string HtmlItalic = "i";
        internal const string HtmlEmphasis = "em";
        internal const string HtmlCode = "code";
        internal const string HtmlSpan = "span";
        internal const string HtmlAnchor = "a";
        internal const string HtmlLineBreak = "br";

        internal const string HtmlImage = "img";

        internal const string HtmlHref = "href";
        internal const string HtmlSource = "src";

        internal const string HtmlOrderedList = "ol";
        internal const string HtmlUnorderedList = "ul";
        internal const string HtmlListItem = "li";

        internal const string HtmlTable = "table";
        internal const string HtmlTableHead = "thead";
        internal const string HtmlTableBody = "tbody";
        internal const string HtmlTableFooter = "tfoot";
        internal const string HtmlTableRow = "tr";
        internal const string HtmlTableHeadCell = "th";
        internal const string HtmlTableCell = "td";
        internal const string HtmlTableColSpan = "colspan";
        internal const string HtmlTableRowSpan = "rowspan";
        #endregion

        /************************************************************************/

        #region Extension Methods (HTML)
        internal static HtmlElementType GetHtmlElementType(this HtmlNode node)
        {
            if (SectionBlocks.Contains(node.Name))
            {
                return HtmlElementType.Section;
            }
            if (ParagraphBlocks.Contains(node.Name))
            {
                return HtmlElementType.Paragraph;
            }
            if (InlineElements.Contains(node.Name))
            {
                return HtmlElementType.Inline;
            }
            if (ListElements.Contains(node.Name))
            {
                return HtmlElementType.List;
            }
            if (ListItemElements.Contains(node.Name))
            {
                return HtmlElementType.ListItem;
            }
            if (TableElements.Contains(node.Name))
            {
                return HtmlElementType.Table;
            }
            if (TableItemElements.Contains(node.Name))
            {
                return HtmlElementType.TableItem;
            }
            if (ImageElements.Contains(node.Name))
            {
                return HtmlElementType.Image;
            }
            if (IgnoredElements.Contains(node.Name))
            {
                return HtmlElementType.Ignore;
            }
            return HtmlElementType.Unknown;
        }

        internal static bool HasZeroChildren(this HtmlNode node) => node.ChildNodes.Count == 0;

        /// <summary>
        /// Gets a boolean that indicates if this node contains only text node(s)
        /// </summary>
        /// <param name="node">The node</param>
        /// <returns></returns>
        internal static bool HasOnlyText(this HtmlNode node) => node.ChildCount(HtmlNodeType.Text) == node.ChildNodes.Count;

        /// <summary>
        /// Gets the count of children of the specified type
        /// </summary>
        /// <param name="node">The node</param>
        /// <param name="nodeType">The node type to get the count for</param>
        /// <returns>The count</returns>
        internal static int ChildCount(this HtmlNode node, HtmlNodeType nodeType) => node.ChildNodes.Count(n => n.NodeType == nodeType);

        internal static bool IsEmptyText(this HtmlNode node) => node.NodeType == HtmlNodeType.Text && node.InnerText.Trim().Length == 0;

        internal static string GetCleanInnerText(this HtmlNode node) => node.InnerText.Replace("&nbsp;", " ");
        internal static string GetCleanDirectInnerText(this HtmlNode node) => node.GetDirectInnerText().Replace("&nbsp;", " ");

        internal static string GetImageSource(this HtmlNode node)
        {
            if (node.Attributes[HtmlSource] is HtmlAttribute attrib && !string.IsNullOrEmpty(attrib.Value))
            {
                return attrib.Value;
            }
            return null;
        }

        internal static bool IsTableCell(this HtmlNode node) => node.Name == HtmlTableHeadCell || node.Name == HtmlTableCell;

        /// <summary>
        /// Removes all comment nodes from the parent and all its descendants
        /// </summary>
        /// <param name="parentNode">The parent nod</param>
        internal static void RemoveAllCommentNodes(this HtmlNode parentNode)
        {
            List<HtmlNode> commentNodes = new();
            parentNode.PopulateCommentNodes(commentNodes);
            commentNodes.ForEach(node => node.Remove());
        }

        private static void PopulateCommentNodes(this HtmlNode parentNode, List<HtmlNode> commentNodes)
        {
            foreach (HtmlNode node in parentNode.ChildNodes)
            {
                if (node.NodeType == HtmlNodeType.Comment)
                {
                    commentNodes.Add(node);
                }
                node.PopulateCommentNodes(commentNodes);
            }
        }
        #endregion
    }
}