using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Media;
using System.Windows;

namespace Restless.Converters
{
    /// <summary>
    /// Represents a collection of <see cref="BlockConfig"/> objects
    /// </summary>
    public class BlockConfigCollection
    {
        #region Private
        private readonly List<BlockConfig> storage;
        #endregion

        /************************************************************************/

        #region Constructors

        /// <summary>
        /// Initializes a new instance of the <see cref="BlockConfigCollection"/> class
        /// </summary>
        public BlockConfigCollection() : this(false)
        {
        }

        /// <summary>
        /// Initializes a new instance of the <see cref="BlockConfigCollection"/> class
        /// </summary>
        /// <param name="addDefaults">true to add default block configurations</param>
        public BlockConfigCollection(bool addDefaults)
        {
            storage = new List<BlockConfig>();
            if (addDefaults)
            {
                AddDefaults();
            }
        }
        #endregion

        /************************************************************************/

        #region Public methods
        /// <summary>
        /// Adds or updates a block config
        /// </summary>
        /// <param name="blockConfig">The block config to add</param>
        /// <remarks>
        /// If a block config with the block id doesn't yet exist, it will be added.
        /// If it does exist, the values of the existing config will be updated.
        /// </remarks>
        public void Add(BlockConfig blockConfig)
        {
            ArgumentNullException.ThrowIfNull(nameof(blockConfig));
            if (!Contains(blockConfig.Id))
            {
                storage.Add(blockConfig);
            }
            else
            {
                UpdateBlockConfig(blockConfig);
            }
        }

        /// <summary>
        /// Gets a boolean value that indicates whether the configuration with the specified id exists in the collection.
        /// </summary>
        /// <param name="blockId">The id to check.</param>
        /// <returns>true if a configuration with <paramref name="blockId"/> exists; otherwise, false</returns>
        public bool Contains(string blockId) => Get(blockId) is not null;

        /// <summary>
        /// Gets the configuration with the specified id.
        /// </summary>
        /// <param name="blockId">The id</param>
        /// <returns>The configuration, or null if it doesn't exist</returns>
        public BlockConfig Get(string blockId) => storage.FirstOrDefault(b => b.Id == blockId);

        /// <summary>
        /// Clears all configurations from the collection.
        /// </summary>
        public void Clear()
        {
            storage.Clear();
        }
        #endregion

        /************************************************************************/

        #region Private methods
        private void UpdateBlockConfig(BlockConfig source)
        {
            if (Get(source.Id) is BlockConfig dest)
            {
                dest.Background = source.Background;
                dest.BorderBrush = source.BorderBrush;
                dest.BorderThickness = source.BorderThickness;
                dest.FontSize = source.FontSize;
                dest.FontWeight = source.FontWeight;
                dest.Foreground = source.Foreground;
                dest.Padding = source.Padding;
            }
        }

        private void AddDefaults()
        {
            Add(new BlockConfig(HtmlSchema.HtmlHeader1, 24, FontWeights.Bold)
            {
                Foreground = Brushes.Red,
                BorderBrush = Brushes.DimGray,
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(0, 0, 0, 1)
            });

            Add(new BlockConfig(HtmlSchema.HtmlHeader2, 20, FontWeights.Bold)
            {
                Foreground = Brushes.Green
            });

            Add(new BlockConfig(HtmlSchema.HtmlHeader3, 18, FontWeights.Bold));
            Add(new BlockConfig(HtmlSchema.HtmlHeader4, 14, FontWeights.Bold));

            Add(new BlockConfig(HtmlSchema.HtmlPre)
            {
                BorderBrush = Brushes.Gray,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(6)
            });

            Add(new BlockConfig(HtmlSchema.HtmlUnorderedList, 24)
            {
                BorderBrush = Brushes.Green,
                BorderThickness = new Thickness(3),
                Padding = new Thickness(50, 3, 3, 3)

            });

            Add(new BlockConfig(HtmlSchema.HtmlOrderedList, 24)
            {
                BorderBrush = Brushes.Blue,
                BorderThickness = new Thickness(3),
                Padding = new Thickness(50, 3, 3, 3)
            });

            Add(new BlockConfig(HtmlSchema.HtmlTable)
            {
                Spacing = 5,
            });

            Add(new BlockConfig(HtmlSchema.HtmlTableHeadCell)
            {
                BorderBrush = Brushes.LightGray,
                BorderThickness = new Thickness(1),
                Background = Brushes.LightSteelBlue,
                Padding = new Thickness(5)
            });

            Add(new BlockConfig(HtmlSchema.HtmlTableCell)
            {
                BorderBrush = Brushes.LightGray,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(5)
            });
        }
        #endregion
    }
}