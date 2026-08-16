using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;

namespace Restless.Converters
{
    /// <summary>
    /// Provides public extension methods
    /// </summary>
    public static class Extensions
    {
        #region FlowDocument extensions
        /// <summary>
        /// Discovers all elements in the flow document of the specified type.
        /// </summary>
        /// <typeparam name="T">The type</typeparam>
        /// <param name="document">The flow document</param>
        /// <param name="callback">Callback for the discovered object(s)</param>
        public static void Discover<T>(this FlowDocument document, Action<T> callback) where T : DependencyObject
        {
            WalkBlockCollection(document.Blocks, callback);
        }

        private static void WalkBlockCollection<T>(BlockCollection blocks, Action<T> callback) where T : DependencyObject
        {
            foreach (Block block in blocks)
            {
                if (block is T)
                {
                    callback(block as T);
                }

                if (block is Section section)
                {
                    WalkBlockCollection(section.Blocks, callback);
                }

                if (block is Paragraph para)
                {
                    WalkInlineCollection(para.Inlines, callback);
                }

                if (block is Table table)
                {
                    foreach (TableRowGroup rowGroup in table.RowGroups)
                    {
                        foreach (TableRow row in rowGroup.Rows)
                        {
                            foreach (TableCell cell in row.Cells)
                            {
                                WalkBlockCollection(cell.Blocks, callback);
                            }
                        }
                    }
                }

                if (block is List list)
                {
                    foreach (ListItem listItem in list.ListItems)
                    {
                        WalkBlockCollection(listItem.Blocks, callback);
                    }
                }

                if (block is BlockUIContainer container)
                {
                    if (container.Child is T child1)
                    {
                        callback(child1);
                    }
                    if (container.Child is Decorator decorator && decorator.Child is T child2)
                    {
                        callback(child2);
                    }
                }
            }
        }

        private static void WalkInlineCollection<T>(InlineCollection inlines, Action<T> callback) where T : DependencyObject
        {
            foreach (Inline inline in inlines)
            {
                if (inline is T)
                {
                    callback(inline as T);
                }

                if (inline is Span span)
                {
                    WalkInlineCollection(span.Inlines, callback);
                }

                if (inline is InlineUIContainer container)
                {
                    if (container.Child is T child1)
                    {
                        callback(child1);
                    }
                    if (container.Child is Decorator decorator && decorator.Child is T child2)
                    {
                        callback(child2);
                    }
                }
            }
        }
        #endregion

        /************************************************************************/

        #region Other extensions
        /// <summary>
        /// Gets a boolean value that indicates if the string is a valid uri.
        /// </summary>
        /// <param name="uri">The string to check</param>
        /// <returns>true if <paramref name="uri"/> is valid; otherwise, false.</returns>
        /// <remarks>
        /// A uri string checked by this method is considered valid if it is well formed,
        /// absolute, and points to an http or https resource.
        /// </remarks>
        public static bool IsValidUri(this string uri)
        {
            if (!Uri.IsWellFormedUriString(uri, UriKind.Absolute))
            {
                return false;
            }
            if (!Uri.TryCreate(uri, UriKind.Absolute, out Uri temp))
            {
                return false;
            }
            return temp.Scheme == Uri.UriSchemeHttp || temp.Scheme == Uri.UriSchemeHttps;
        }
        #endregion
    }
}