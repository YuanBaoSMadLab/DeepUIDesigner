namespace Restless.Converters
{
    /// <summary>
    /// Provides values that determine what action occurs in <see cref="PasteHandler"/>
    /// when a registered control receives a paste or drag/drop.
    /// </summary>
    public enum HtmlPasteAction
    {
        /// <summary>
        /// No action. The registered control will perform its default
        /// </summary>
        None,
        /// <summary>
        /// Automatic. Paste handler will determine
        /// </summary>
        Auto,
        /// <summary>
        /// Convert incoming html to plain text
        /// </summary>
        ConvertToText,
        /// <summary>
        /// Convert incoming html to xaml
        /// </summary>
        ConvertToXaml,
        /// <summary>
        /// Convert incoming html to xaml and present it as text
        /// </summary>
        ConvertToXamlText,
    }
}