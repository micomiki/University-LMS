
import { useEffect, useState } from 'react'

type Material = {
  id: number
  title: string
  description: string | null
  original_filename: string
  file_size: number
  created_at: string
  course_id: number
}

type Props = {
  courseId: number
  token: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function CourseMaterials({
  courseId,
  token,
}: Props) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] =
    useState<number | null>(null)

  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadMaterials() {
      setLoading(true)
      setError('')
      setMaterials([])

      try {
        const response = await fetch(
          `/api/materials/courses/${courseId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          if (response.status === 403) {
            throw new Error(
              'You must be enrolled in this course to access its materials.'
            )
          }

          throw new Error(
            `Unable to load course materials (${response.status}).`
          )
        }

        const data: Material[] = await response.json()

        if (!controller.signal.aborted) {
          setMaterials(data)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load course materials.'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadMaterials()

    return () => controller.abort()
  }, [courseId, token])

  async function downloadMaterial(material: Material) {
    setDownloadingId(material.id)
    setError('')

    try {
      const response = await fetch(
        `/api/materials/${material.id}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(
          `Download failed (${response.status}).`
        )
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = downloadUrl
      link.download =
        material.original_filename || 'course-material'

      document.body.appendChild(link)
      link.click()
      link.remove()

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl)
      }, 1000)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to download the material.'
      )
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section className="panel">
      <div className="materials-header">
        <div>
          <h2>Course Materials</h2>
          <p>
            Lecture slides, documents, and learning resources.
          </p>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p>Loading course materials...</p>
      ) : materials.length === 0 ? (
        !error && <p>No materials have been uploaded yet.</p>
      ) : (
        <div className="materials-list">
          {materials.map((material) => (
            <article
              key={material.id}
              className="material-item"
            >
              <div className="material-info">
                <h3>{material.title}</h3>

                {material.description && (
                  <p>{material.description}</p>
                )}

                <p className="material-meta">
                  {material.original_filename}
                  {' · '}
                  {formatFileSize(material.file_size)}
                  {' · '}
                  {new Date(
                    material.created_at
                  ).toLocaleDateString()}
                </p>
              </div>

              <button
                type="button"
                disabled={downloadingId !== null}
                onClick={() =>
                  void downloadMaterial(material)
                }
              >
                {downloadingId === material.id
                  ? 'Downloading...'
                  : 'Download'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
