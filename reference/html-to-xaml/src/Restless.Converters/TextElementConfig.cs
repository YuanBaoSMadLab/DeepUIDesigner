using System;
using System.Windows;
using System.Windows.Media;

namespace Restless.Converters
{
    /// <summary>
    /// Represents configuration that may be applied to a text element.
    /// </summary>
    public class TextElementConfig
    {
        #region Private
        private double fontSize;
        #endregion

        /************************************************************************/

        #region Constants
        /// <summary>
        /// Gets the default font size
        /// </summary>
        public const double DefaultFontSize = 12.5;
        #endregion

        /************************************************************************/

        #region Properties
        /// <summary>
        /// Gets the config id
        /// </summary>
        public string Id { get; }

        /// <summary>
        /// Gets or sets the background brush
        /// </summary>
        public Brush Background { get; set; }

        /// <summary>
        /// Gets or sets the foreground brush
        /// </summary>
        public Brush Foreground { get; set; }

        /// <summary>
        /// Gets or sets the font size.
        /// </summary>
        public double FontSize
        {
            get => fontSize;
            set => fontSize = Math.Max(value, 0);
        }

        /// <summary>
        /// Helper shortcut property. Returns true if <see cref="FontSize"/> is greater than zero
        /// </summary>
        public bool HasFontSize => FontSize > 0;

        /// <summary>
        /// Gets or sets the font weight
        /// </summary>
        public FontWeight FontWeight { get; set; }

        /// <summary>
        /// Helper shortcut property. Returns true if <see cref="FontWeight"/> is other than Normal.
        /// </summary>
        public bool HasFontWeight => FontWeight != FontWeights.Normal;
        #endregion

        /************************************************************************/

        #region Constructor
        /// <summary>
        /// Initializes a new instance of the <see cref="TextElementConfig"/> class
        /// </summary>
        /// <param name="id">The config id</param>
        public TextElementConfig(string id) : this(id, DefaultFontSize)
        {
        }

        /// <summary>
        /// Initializes a new instance of the <see cref="TextElementConfig"/> class
        /// </summary>
        /// <param name="id">The config id</param>
        /// <param name="fontSize">The font size</param>
        public TextElementConfig(string id, double fontSize) : this(id, fontSize, FontWeights.Normal)
        {
        }

        /// <summary>
        /// Initializes a new instance of the <see cref="TextElementConfig"/> class
        /// </summary>
        /// <param name="id">The config id</param>
        /// <param name="fontSize">The font size</param>
        /// <param name="fontWeight">The font weight</param>
        public TextElementConfig(string id, double fontSize, FontWeight fontWeight)
        {
            ArgumentException.ThrowIfNullOrEmpty(id, nameof(id));
            Id = id;
            FontSize = fontSize;
            FontWeight = fontWeight;
        }
        #endregion
    }
}