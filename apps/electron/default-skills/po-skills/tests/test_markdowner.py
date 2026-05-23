import os
import sys


SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))


def test_table_cell_images_render_as_html_img_tags():
    import markdowner

    html = (
        "<table><tbody><tr>"
        '<td><img src="./images/a.png" alt="A"/><img src="./images/b.png" alt="B"/></td>'
        "<td>说明</td>"
        "</tr></tbody></table>"
    )

    markdown = markdowner.to_markdown(html)

    assert '<img src="./images/a.png" alt="A" />' in markdown
    assert '<br/><img src="./images/b.png" alt="B" />' in markdown
    assert "![A](./images/a.png)" not in markdown


def test_non_table_images_stay_markdown_images():
    import markdowner

    markdown = markdowner.to_markdown('<p><img src="./images/a.png" alt="A"/></p>')

    assert markdown == "![A](./images/a.png)"
