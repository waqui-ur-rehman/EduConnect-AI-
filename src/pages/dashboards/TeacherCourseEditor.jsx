import {
  BookOpen,
  CheckCircle2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

function TeacherCourseEditor({
  courseForm,
  setCourseForm,
  editingId,
  teacherFocusLabel,
  onSave,
  onCancel,
  onThumbnailUpload,
  onRemoveThumbnail,
  pending = false,
}) {
  return (
    <form onSubmit={onSave} className="edc-course-editor">
      <div className="edc-course-editor-header">
        <div>
          <span className="edc-course-editor-eyebrow">COURSE MANAGEMENT</span>
          <h2>{editingId ? "Edit Course" : "Create New Course"}</h2>
          <p>
            Add your course information and a thumbnail to make your course
            stand out.
          </p>
        </div>

        <button
          type="button"
          className="edc-course-editor-close"
          onClick={onCancel}
          aria-label="Close form"
        >
          <X size={20} />
        </button>
      </div>

      <div className="edc-course-editor-layout">
        <div className="edc-course-editor-fields">
          <h3>Course Information</h3>

          <div className="edc-course-editor-field">
            <label htmlFor="edc-course-title">Course Title</label>
            <input
              id="edc-course-title"
              required
              value={courseForm.title}
              onChange={(event) =>
                setCourseForm({ ...courseForm, title: event.target.value })
              }
              placeholder="e.g. Complete React Developer Course"
            />
          </div>

          <div className="edc-course-editor-two-cols">
            <div className="edc-course-editor-field">
              <label htmlFor="edc-course-category">Category</label>
              <select
                id="edc-course-category"
                value={courseForm.category}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, category: event.target.value })
                }
              >
                <option>Development</option>
                <option>Design</option>
                <option>Business</option>
                <option>Data Science</option>
                <option>IT &amp; Software</option>
                <option>Personal Growth</option>
              </select>
            </div>

            <div className="edc-course-editor-field">
              <label htmlFor="edc-course-level">Course Level</label>
              <select
                id="edc-course-level"
                value={courseForm.level}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, level: event.target.value })
                }
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>
          </div>

          <div className="edc-course-editor-field">
            <label htmlFor="edc-course-description">Course Description</label>
            <textarea
              id="edc-course-description"
              required
              rows={5}
              value={courseForm.description}
              onChange={(event) =>
                setCourseForm({
                  ...courseForm,
                  description: event.target.value,
                })
              }
              placeholder="Explain what students will learn..."
            />
          </div>

          <div className="edc-course-editor-field">
            <label htmlFor="edc-course-requirements">Requirements</label>
            <textarea id="edc-course-requirements" rows={3}
              value={Array.isArray(courseForm.requirements) ? courseForm.requirements.join("\n") : courseForm.requirements || ""}
              onChange={(event) => setCourseForm({ ...courseForm, requirements: event.target.value })} />
          </div>
          <div className="edc-course-editor-field">
            <label htmlFor="edc-course-outcomes">Learning outcomes</label>
            <textarea id="edc-course-outcomes" rows={3}
              value={Array.isArray(courseForm.learningOutcomes) ? courseForm.learningOutcomes.join("\n") : courseForm.learningOutcomes || ""}
              onChange={(event) => setCourseForm({ ...courseForm, learningOutcomes: event.target.value })} />
          </div>
          <div className="edc-course-editor-field edc-course-audience">
            <span>Recommended student audience</span>
            <strong>{teacherFocusLabel}</strong>
            <p>
              Published courses and video lectures use the teaching focus saved
              in My Profile to appear in related student recommendations.
            </p>
          </div>

          <div className="edc-course-editor-field">
            <label htmlFor="edc-course-price">Course Price (PKR)</label>
            <input
              id="edc-course-price"
              type="number"
              min="0"
              required
              value={courseForm.price}
              onChange={(event) =>
                setCourseForm({ ...courseForm, price: event.target.value })
              }
              placeholder="e.g. 2500"
            />
          </div>
        </div>

        <div className="edc-course-editor-media">
          <h3>Course Thumbnail</h3>
          <p>Upload a cover image for your course.</p>

          <div className="edc-course-editor-image-box">
            {courseForm.thumbnail ? (
              <img src={courseForm.thumbnail} alt="Course thumbnail preview" />
            ) : (
              <div className="edc-course-editor-image-empty">
                <BookOpen size={42} />
                <strong>Course Cover</strong>
                <span>Recommended ratio 16:9</span>
              </div>
            )}
          </div>

          <label className="edc-course-editor-upload">
            <Plus size={17} />
            {courseForm.thumbnail ? "Change Image" : "Upload Image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onThumbnailUpload}
              hidden
            />
          </label>

          {courseForm.thumbnail && (
            <button
              type="button"
              className="edc-course-editor-remove"
              onClick={onRemoveThumbnail}
            >
              <Trash2 size={16} />
              Remove Image
            </button>
          )}

          <p className="edc-course-editor-image-help">
            JPG, PNG or WebP · Maximum 1 MB
          </p>

          <div className="edc-course-editor-tip">
            <strong>Course Tip</strong>
            <p>
              Use a clear title, useful description, and attractive thumbnail
              to help students understand your course.
            </p>
          </div>
        </div>
      </div>

      <div className="edc-course-editor-footer">
        <button
          type="button"
          className="edc-course-editor-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>

        <button type="submit" className="edc-course-editor-save" disabled={pending}>
          <CheckCircle2 size={18} />
          {pending ? "Saving..." : editingId ? "Update Course" : "Save Course"}
        </button>
      </div>
    </form>
  );
}

export default TeacherCourseEditor;
