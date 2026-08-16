namespace Restless.Converters
{
    /// <summary>
    /// Represents converter options that affect <see cref="HtmlToXamlConverter"/>
    /// </summary>
    public class ConverterOptions
    {
        #region Private
        private const string SectionBlockId = "section";
        #endregion

        /************************************************************************/

        #region Properties
        /// <summary>
        /// Gets or sets a value that determines if the top level
        /// element is a Flow Document.
        /// </summary>
        /// <remarks>
        /// When this property is true, the top level element of the output
        /// is a flow document. When false, the top level element is a section.
        /// The default is false. If you're going to place the output into
        /// a RichTextBox, this property should be left at its default.
        /// </remarks>
        public bool IsTopLevelFlowDocument { get; set; }

        /// <summary>
        /// Gets the block config to apply to sections
        /// </summary>
        public BlockConfig SectionConfig { get; }

        /// <summary>
        /// Gets or sets a value that determines whether default block configs
        /// are added to the block config collection. The default is true.
        /// </summary>
        public bool AddDefaultBlockConfigs { get; set; }

        /// <summary>
        /// Gets or sets a value that determines if unknown nodes are processed.
        /// The default value is false.
        /// </summary>
        public bool ProcessUnknown { get; set; }

        /// <summary>
        /// Gets or sets a value that determeines if "xml:space", "preserve" is added
        /// The default value is false.
        /// </summary>
        public bool SetPreserve { get; set; }

        /// <summary>
        /// Gets or sets a value that determines whether output is indented.
        /// The default is true.
        /// </summary>
        public bool IsOutputIndented { get; set; }
        #endregion

        /************************************************************************/

        #region Constructor
        /// <summary>
        /// Initializes a new instance of the <see cref="ConverterOptions"/> class
        /// </summary>
        public ConverterOptions()
        {
            IsTopLevelFlowDocument = false;
            SetPreserve = false;
            IsOutputIndented = false;
            AddDefaultBlockConfigs = true;
            ProcessUnknown = false;
            SectionConfig = new BlockConfig(SectionBlockId);
        }
        #endregion
    }
}