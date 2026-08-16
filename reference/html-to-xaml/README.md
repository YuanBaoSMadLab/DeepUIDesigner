# Restless Converters

[![Nuget](https://img.shields.io/nuget/v/Restless.Converters.svg?style=flat-square)](https://www.nuget.org/packages/Restless.Converters/) 

This project provides an Html to Xaml converter and a custom paste handler that enables you to copy/paste (or drag/drop) information from a web site 
into the FlowDocument of a Rich Text Box.

The Html to Xaml converter does not attempt to completely replicate the incoming html. Instead, it enables you to specify (for instance) the appearance of an incoming **H1** element, 
rather than copying the style used on the web site. Other tags may be similarly customized.

## Usage

```c#
string html = GetHtml();
string xaml = HtmlToXamlConverter.Create().SetHtml(html).Convert();
```

You can also supply an optional **ConverterOptions** object

```c#
string html = GetHtml();
string xaml = HtmlToXamlConverter.Create(new ConverterOptions()
{
    AddDefaultBlockConfigs = false,
    IsOutputIndented = true
}) .SetHtml(html).Convert();
```

## Converter Options
Converter options affect how the xaml is generated.

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| IsTopLevelFlowDocument | bool | **false** | When this property is true, the top level element of the output is a flow document. When false, the top level element is a section. If you're going to place the output into a RichTextBox, this property should be left at its default.|
| SectionConfig | BlockConfig | **BlockConfig** | Provides access to the configuration that is applied to Xaml Section nodes |
| AddDefaultBlockConfigs | bool | **true** | Determines whether default block configurations are applied. Defaults include settings for **H1**, **H2**, **UL**, **OL**, and others. You can change any defaults before conversion or supply your own, or both. |
| ProcessUnknown | bool | **false** | Determines whether unknown nodes are processed. When an unknown node is processed, it appears in the xaml with its name and inner text. Mostly a debugging aide. |
| SetPreserve | bool | **false** | Determines whether the xaml output has **xml:space preserve** added. |
| IsOutputIndented | bool | **false** | Determines whether xaml output is indented. When **false**, xaml is all on one long line. When **true**, the xaml is broken up into lines, indented, and easier to read. |

## Paste Handler
Paste handler provides a way to register controls for automatic custom paste handling. 

```c#
PasteHandler.Register(MyRichTextBox);
```

When your RichTextBox is registered for automatic usage, you can
copy/paste (or drag/drop) from a web site, and the conversion occurs
behind the scenes

You can also register a TextBox for automatic usage, but this produces no difference
unless you register it with the optional **PasteHandlerOptions**

```c#
PasteHandler.Register(MyTextBox, new PasteHandlerOptions(HtmlPasteAction.ConvertToText));
```

This enables the TextBox to receive the actual Html, not just the text as with the control's
default behavior. Note that if you keep a reference to **PasteHandler** (the return value
of the **Register()** method), you can change the paste handling behavior at run time.
