# Restless Converters

This project provides an Html to Xaml converter and a custom paste handler that enables you to copy/paste 
(or drag/drop) information from a web site into the FlowDocument of a Rich Text Box.

## Manual Usage

```c#
string html = GetHtml();
string xaml = HtmlToXamlConverter.Create().SetHtml(html).Convert();
// do something with the xaml
```

## Automatic Usage
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

