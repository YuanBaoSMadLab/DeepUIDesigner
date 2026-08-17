namespace Restless.Converters
{
    /// <summary>
    /// Provides an enum of the html element types in order to route to the correct processor
    /// </summary>
    public enum HtmlElementType
    {
        /// <summary>
        /// No type has been assigned
        /// </summary>
        None,
        /// <summary>
        /// The element is a section type such as div
        /// </summary>
        Section,
        /// <summary>
        /// The element is a paragraph type
        /// </summary>
        Paragraph,
        /// <summary>
        /// The element is an inline type, b, i, em, etc.
        /// </summary>
        Inline,
        /// <summary>
        /// The element is a list, ul, ol
        /// </summary>
        List,
        /// <summary>
        /// The element is a list item, li
        /// </summary>
        ListItem,
        /// <summary>
        /// The element is a table, table
        /// </summary>
        Table,
        /// <summary>
        /// The element is one of various table item types, thead, tbody, tr, th, td, etc.
        /// </summary>
        TableItem,
        /// <summary>
        /// The element is an image type
        /// </summary>
        Image,
        /// <summary>
        /// The element is deliberately ignored
        /// </summary>
        Ignore,
        /// <summary>
        /// The element is an unknown or unsupported type
        /// </summary>
        Unknown
    }
}