load("//tensorboard/defs:defs.bzl", "tf_ng_module", "tf_sass_binary", "tf_ts_library")

package(default_visibility = ["//tensorboard:internal"])

tf_sass_binary(
    name = "data_table_styles",
    src = "data_table_component.scss",
    strict_deps = False,
    deps = [
        "//tensorboard/webapp:angular_material_sass_deps",
        "//tensorboard/webapp/theme",
    ],
)

tf_sass_binary(
    name = "data_table_header_styles",
    src = "data_table_header_component.scss",
    strict_deps = False,
    deps = [
        "//tensorboard/webapp:angular_material_sass_deps",
        "//tensorboard/webapp/theme",
    ],
)

tf_sass_binary(
    name = "column_selector_modal_styles",
    src = "column_selector_modal.scss",
    strict_deps = False,
    deps = [
        "//tensorboard/webapp:angular_material_sass_deps",
        "//tensorboard/webapp/theme",
    ],
)

tf_ng_module(
    name = "data_table",
    srcs = [
        "data_table_component.ts",
        "data_table_module.ts",
    ],
    assets = [
        "data_table_component.ng.html",
        ":data_table_styles",
    ],
    deps = [
        ":data_table_header",
        ":types",
        "//tensorboard/webapp/angular:expect_angular_material_icon",
        "//tensorboard/webapp/metrics/views/card_renderer:scalar_card_types",
        "//tensorboard/webapp/widgets/line_chart_v2/lib:formatter",
        "@npm//@angular/common",
        "@npm//@angular/core",
    ],
)

tf_ng_module(
    name = "data_table_header",
    srcs = [
        "data_table_header_component.ts",
        "data_table_header_module.ts",
    ],
    assets = [
        "data_table_header_component.ng.html",
        ":data_table_header_styles",
    ],
    deps = [
        ":types",
        "//tensorboard/webapp/angular:expect_angular_material_icon",
        "@npm//@angular/common",
        "@npm//@angular/core",
    ],
)

tf_ng_module(
    name = "column_selector",
    srcs = [
        "column_selector_container.ts",
        "column_selector_modal.ts",
        "column_selector_module.ts",
    ],
    assets = [
        "column_selector_modal.ng.html",
        ":column_selector_modal_styles",
    ],
    deps = [
        ":types",
        "//tensorboard/webapp/angular:expect_angular_material_button",
        "//tensorboard/webapp/angular:expect_angular_material_dialog",
        "//tensorboard/webapp/angular:expect_angular_material_icon",
        "//tensorboard/webapp/angular:expect_angular_material_input",
        "@npm//@angular/common",
        "@npm//@angular/core",
    ],
)

tf_ts_library(
    name = "types",
    srcs = [
        "types.ts",
    ],
)

tf_ts_library(
    name = "data_table_test",
    testonly = True,
    srcs = [
        "data_table_test.ts",
    ],
    deps = [
        ":data_table",
        ":types",
        "//tensorboard/webapp/angular:expect_angular_core_testing",
        "//tensorboard/webapp/angular:expect_angular_material_icon",
        "@npm//@angular/core",
        "@npm//@angular/platform-browser",
        "@npm//@types/jasmine",
    ],
)
