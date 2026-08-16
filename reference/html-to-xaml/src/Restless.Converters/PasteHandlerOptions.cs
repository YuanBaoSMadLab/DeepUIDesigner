using System;

namespace Restless.Converters
{
    /// <summary>
    /// Represents options that affect the behavior of a <see cref="PasteHandler"/> instance.
    /// </summary>
    public class PasteHandlerOptions
    {
        #region Private
        private double maxImageDimenison;
        #endregion

        /************************************************************************/

        #region Constants (public)
        /// <summary>
        /// Gets the minimum value that may be assigned to <see cref="MaxImageDimension"/>.
        /// </summary>
        public const double MinMaxImagePasteSize = 100;

        /// <summary>
        /// Gets the maximum value that may be assigned to <see cref="MaxImageDimension"/>.
        /// </summary>
        public const double MaxMaxImagePasteSize = 800;

        /// <summary>
        /// Gets the default value for <see cref="MaxImageDimension"/>.
        /// </summary>
        public const double DefaultMaxImagePasteSize = 500;
        #endregion

        /************************************************************************/

        #region Properties
        /// <summary>
        /// Gets the html paste action.
        /// The default is <see cref="HtmlPasteAction.Auto"/>
        /// </summary>
        public HtmlPasteAction HtmlPasteAction
        {
            get;
            internal set;
        }

        /// <summary>
        /// Gets or sets the maximum image dimension.
        /// </summary>
        /// <remarks>
        /// When pasting an image, if it has a dimension greater than this value, it will be resized.
        /// This property is clamped between <see cref="MinMaxImagePasteSize"/> and <see cref="MaxMaxImagePasteSize"/>.
        /// The default value for this property is <see cref="DefaultMaxImagePasteSize"/>.
        /// </remarks>
        public double MaxImageDimension
        {
            get => maxImageDimenison;
            set => maxImageDimenison = Math.Clamp(value, MinMaxImagePasteSize, MaxMaxImagePasteSize);
        }

        /// <summary>
        /// Gets or sets a value that determines whether an incoming fragment
        /// that ends with a span tag should be wrapped in a div.
        /// The default is false.
        /// </summary>
        public bool WrapPartialFragment
        {
            get;
            set;
        }
        #endregion

        /************************************************************************/

        #region Constructors
        /// <summary>
        /// Initializes a new instance of the <see cref="PasteHandlerOptions"/> class
        /// with the default paste action
        /// </summary>
        public PasteHandlerOptions() : this (HtmlPasteAction.Auto)
        {
        }

        /// <summary>
        /// Initializes a new instance of the <see cref="PasteHandlerOptions"/> class
        /// </summary>
        /// <param name="pasteAction">The paste action</param>
        public PasteHandlerOptions(HtmlPasteAction pasteAction)
        {
            HtmlPasteAction = pasteAction;
            MaxImageDimension = DefaultMaxImagePasteSize;
            WrapPartialFragment = false;
        }
        #endregion
    }
}