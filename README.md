## UI
https://github.com/Okafor-twd/SynapseV3/tree/UI -- UI source code.
<br>
https://github.com/Okafor-twd/SynapseV3/tree/SynZ -- the UI with the Synapse Z API.
<br>
https://github.com/Okafor-twd/SynapseV3/blob/main/differences.md -- differences from original ui and reconstruction

# Hollywood Sample Theme

This is a template that can be used for building modern Hollywood (SX 3.0) themes.

For more information about building dynamic, animated and configurable themes, we highly suggest you take a look at our [great selection](https://web.archive.org/web/20230327214402/https://github.com/synllc/hollywood-themes) of default pre-included themes in the Hollywood theme repository. This repository serves more as a documentation reference for people in the process of building themes and researching the internals of our theming engine.

[**➔ Want to learn how to make great themes? Learn the basics of CSS today with this free online course offered by `web.dev`.**](https://web.archive.org/web/20230327214402/https://web.dev/learn/css/)

## Differences between legacy and Hollywood themes

- **SX 2.0 themes** are limited to color, font and image customization. **SX 3.0 themes** are **unlimited** in terms of customization, allowing you to change colors, fonts, borders, corners, element sizes, layouts, and much more. The power of a SX 3.0 theme is limited by the limitations of [Sass](https://web.archive.org/web/20230327214402/https://sass-lang.com/) and cascading stylesheets, which are arguably the most powerful theming engines available.
- **SX 2.0 themes** are static and cannot offer theme-specific configuration and customization. **SX 3.0 themes** can be **greatly customized** by the user if the theme allows it using `theme.json` configuration records, palettes, and metrics.
- **SX 2.0 themes** often have to replace files within the installation directory to achieve extent customization, namely editor customization. **SX 3.0 themes** are **dynamically loaded** by Hollywood and does not require any modifications to the installation or source code to do most things, *including* customizing editor colors.
- Only one **SX 2.0 theme** can be installed at a time due to their hardcoded nature, whereas multiple **SX 3.0 themes** can be installed into `/themes` and chosen within the interface.

## Working with stylesheets

**Your main stylesheet must follow certain rules in order to work correctly.** If you don't follow these rules, Hollywood may refuse to load your theme, or your theme may load incorrectly leading to a broken layout.

### Base theme layout

Your main stylesheet **must** begin with the following sequence (*comments can precede this however*):

```scss
@use 'reset' as *;
$disable-fill: false;

//@STITCH
```

- The `@use 'reset' as *` statement provides your theme with default color and layout variables. If you *do not* include this, either the theme will fail to load due to missing variables, or the entire UI will be broken. **You may provide a custom `reset` stylesheet based on [`_reset.scss`](https://web.archive.org/web/20230327214402/https://github.com/synllc/hollywood-themes/blob/master/_reset.scss) instead if you want to change color variables.**
- The `$disable-fill: false` statement tells the theme engine to either use the default colors or not. **You can set this to true in order to work from a completely blank slate.** Otherwise, if you'd like to build *on top* of the default theme, you can leave it as `false`. If you *do not* include this, the theme engine will assume you are setting it to false.
- The `//@STITCH` statement tells the theme engine where to insert key imports necessary for the interface's structure. If you *do not* include this, either the theme will fail to load, or the entire UI will be broken. **Nothing aside from use statements, the fill variable or comments must precede the stitch.**

If you are working with multiple stylesheets, you may insert `@use`/`@forward`/`@import` statements *before* the stitch statement. Otherwise, any extra CSS/SCSS must be included *after* the stitch statement. If you are making serious structural changes to the interface, we highly suggest including them in your main stylesheet after the stitch statement.

### Variable configuration

By default, the Hollywood theme engine provides multiple variables for you to define through a custom [`_reset.scss`](https://web.archive.org/web/20230327214402/https://github.com/synllc/hollywood-themes/blob/master/_reset.scss) file if you want to. Simply make a copy of the original `_reset.scss` stylesheet, adjust colors and parameters, then replace the `@use 'reset' as *` statement with one pointing to your replacement. **However, *all* variables from the original stylesheet MUST be defined in your own or else the theme engine will fail to load your theme.** If this is not desirable, avoid using a replacement stylesheet altogether.

# Structure reference

## `theme.json` File

This is the format of the `theme.json` file, which dictates theme information, variables and metrics. Only `id` and `name` are required.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Internal identifier for the theme. If `stylesheet` is `true`, its filename must be this, minus the extension. |
| `name` | `string` | Human-readable name for the theme that will show up in the interface. |
| `stylesheet` | `boolean` | Indicates whether or not a cascading stylesheet will be loaded. **Using a stylesheet is highly recommended as it allows you to access the most powerful theming features.** |
| `editor` | `string` | ID of the editor theme to use. `vs`, `vs-dark`, `synapse-dark` and `synapse-light` are supported by default. You can use a custom monaco theme by setting this to `custom` and supplying a theme in a file called `editor.json`. If unset, the interface will load `synapse-dark` by default. |
| `transparencyMode` | `'acrylic' \| 'mica' \| 'mica-tabbed'` | If provided, then this theme will be able to make use of glassy-looking [acrylic](https://web.archive.org/web/20230327214402/https://docs.microsoft.com/en-us/windows/apps/design/style/acrylic) or [mica](https://web.archive.org/web/20230327214402/https://docs.microsoft.com/en-us/windows/apps/design/style/mica) (transparent) window materials, on Windows 11 exclusively. Transparency effects are also supported on macOS. This setting will not change anything on operating systems other than Windows 11/macOS and is useless. **This setting will only be respected if the user enables transparent windows in settings!** Use a setting override to enforce its use. |
| `mode` | `'dark' \| 'light' \| 'auto'` | The overall luminosity of the theme. Dark means the console luminosity will be inverted and any background transparency will have a dark tint. Light means the console colors will stay the same and any background transparency will have a light tint. Auto means the console colors will stay the same and any background transparency will have a tint depending on system settings. No value means no special settings are applied and the system will just choose whatever it thinks is appropriate. |
| `settingOverrides` | Dictionary mapping `string` to `any` | Allows the theme to manually override specific settings, such as the UI or editor layout configuration. Certain settings cannot be overridden by the theme for safety reasons. Each key must be the ID of the setting (IDs of individual settings can be found in the [schematics repository](https://web.archive.org/web/20230327214402/https://github.com/synllc/hollywood-schematics)) and its associated value must be the override. **The user will be prompted to allow these changes and may deny them if they desire.** |
| `syntaxHighlight` | Dictionary mapping `Syntaxes` to `SyntaxValue` | If specified, any semantic highlighting will assume these colors during parsing. Semantic tokenization allows language servers to provide additional token information based on the language server's knowledge on how to resolve symbols in the context of a project. Themes can opt in to use semantic tokens to improve and refine the syntax highlighting. |
| `groups` | Dictionary mapping `string` to `VariableGroup` | The theme can define value groups through this dictionary, and individual element properties in `list` can be bound to a variable group through its name. Each value group has a unique set value. If you point two properties towards the same value group, and the user chooses a value from that group, then these two props will have that group's chosen value. If you want a property to have the same selection of colors, but bound to distinct value groups, simply duplicate the value group. |
| `list` | Dictionary mapping `string` to `Variable` | List of variable elements. Maps a human-readable name to a Variable object. More on the variable object below. |
| `metrics` | Dictionary mapping `string` to `ThemeMetric` | List of adjustable metrics. Useful to provide layout customization to users. More on the metric object below. |

## `Variable`

| Field | Type | Description |
|---|---|---|
| `groups` | Dictionary mapping `string` to `VariableGroup` | Same as the `groups` property in `theme.json`. This can either be a value group OR a constant string specifying a CSS value. Bear in mind the string will be stitched into the resulting stylesheet — there won't be any value type detection, so if you're going to pass a string for the stylesheet (for `content` properties for instance), you need to make sure the actual quote symbols are included. |
| `map` | Dictionary mapping `string` to `string` | Variable name-group map. Each key is the variable you want to style, and the value is the name of the value group (local and global). |
| `description` | `string` | Human-readable description for the variable that will show up in the interface. |

## `ThemeMetricValue`

| Field | Type | Description |
|---|---|---|
| `default` | `number` | Default value for the metric. We suggest something midway between your minimum and maximum. |
| `minimum` *(optional)* | `number` | Minimum number for the metric. Defaults to `default * -2`, unless `negative` is falsy. |
| `maximum` *(optional)* | `number` | Maximum number for the metric. Defaults to `default * 2`. |
| `negative` *(optional)* | `boolean` | Sets whether or not the value can go negative. |

## `ThemeMetric`

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Human-readable title for your metric. |
| `description` | `string` | Should describe what your metric impacts in greater detail. |
| `metric` | `ThemeMetricValue` | The data which defines the metric's behavior. See above. |

## `SyntaxValue`

| Field | Type | Description |
|---|---|---|
| `color` | `Color` | A valid hexadecimal color. |
| `style` *(optional)* | `'bold' \| 'italic'` | Font styling to assume for this part of the syntax. |

## `Syntaxes` keys

**Note:** This is *not* an exhaustive list of all possible semantic token types. Furthermore, some tokens in this list may not have their values respected depending on the language server used. More may get documented in the future.

| Key | Description |
|---|---|
| `comment` | A comment in the code (`-- Hello world!`) |
| `keyword` | `if`, `else`, `function`, etc. |
| `operator` | `+`, `-`, `*`, `/`, `and`, `or`, etc. |
| `type` | `number`, `string`, `table`, etc. when used in `type` or variable declarations. |
| `typeParameter` | `number`, `string`, `table`, etc. when used in function parameters. |
| `function` | The name of the function in a declaration. |
| `member` | The index `def` used in the `abc.def` expression. |
| `variable` | `abc` in `print(abc)`, or `d` in `local d = 1` |
| `parameter` | `a` in `function(a) return a end` |
| `property` | Same as `member`. |
| `enum` | `Enum.*` fields. |
| `macro` | Unused. |
| `namespace` | Unused. |
| `struct` | Unused. |
| `class` | Unused. |
| `interface` | Unused. |
| `label` | Unused. |

# Functions

Hollywood extends the functionality of stylesheets with helper functions that may be relevant to your custom theme.

### `asset`

```scss
asset($relative-url: string)
```

This returns a CSS [`url`](https://web.archive.org/web/20230327214402/https://developer.mozilla.org/en-US/docs/Web/CSS/url) pointing to an asset within your theme's files. This is far easier and more convenient to use than a direct `url` call, which may be restricted for security reasons in the future. **Example use:**

```scss
@font-face {
    font-family: hazyTrip;
    //src: url('./style/default-themes/hazy-trip/W95FA.otf');
    src: asset('W95FA.otf');
}
```

# Stylesheet duties

## Variables

**Variables** allow themes to include their own customization options. Accessible through the theme's stylesheet, their value is bound to an author-defined group of values inserted into either the variable's own local groups or in the theme's global groups, which allows for the creation of palettes and a consistent design language. If more flexibility is desired, value groups can also include a `picker`, which allows users to select the color of their choosing from a color picker. For more information about how variables work within stylesheets, please take a look at the [Sass documentation](https://web.archive.org/web/20230327214402/https://sass-lang.com/documentation/variables).

Even though you can define your own variables, Hollywood already comes with a [list of variables](https://web.archive.org/web/20230327214402/https://github.com/synllc/sample-theme/blob/main/hollywood-dark.scss) ready to customize. Their values automatically default to the values defined in the `Hollywood Dark` theme (which is used as the base for this sample theme), so if you are making a light theme or anything that would contrast poorly with the dark palette of Hollywood, make sure to override the necessary variables or otherwise you will have an ugly Christmas sweater of a theme.

## Metrics

**Metrics** allow themes to include customization options that can impact the theme layout. Similar to variables, their values are accessible via the stylesheet, but unlike variables, they are not bound to color value groups. Instead, they are bound to the value of their sliders which can be manually adjusted by the user in the UI. Because metrics can make the UI look extremely ugly when misconfigured, it's important that the range of values which the user can pick from is limited for every single metric. `Hollywood Dark` already comes with a set of demonstration metrics, including one that controls the roundedness of buttons (as not everyone appreciates round buttons and would much rather have squares).
