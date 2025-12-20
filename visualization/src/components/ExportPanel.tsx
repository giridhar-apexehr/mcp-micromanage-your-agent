import { useState } from 'react'
import { Button } from '@heroui/button'
import { Input } from '@heroui/input'
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/modal'
import { WorkPlan } from '../types'
import {
  downloadAsJSON,
  downloadAsMarkdown,
  downloadAsCSV,
} from '../utils/exportUtils'

interface ExportPanelProps {
  workplan: WorkPlan
  isOpen: boolean
  onClose: () => void
}

/**
 * Export panel component using HeroUI Modal for downloading workplan data.
 * Preserves download behavior and focus trap.
 */
const ExportPanel: React.FC<ExportPanelProps> = ({
  workplan,
  isOpen,
  onClose,
}) => {
  const [fileName, setFileName] = useState('workplan')
  const [isDownloading, setIsDownloading] = useState<string | null>(null)

  /**
   * Common download handler with loading state and user feedback.
   */
  const handleDownload = async (format: string, downloadFn: () => void) => {
    setIsDownloading(format)
    try {
      // Add a slight delay to provide user feedback
      await new Promise((resolve) => setTimeout(resolve, 300))
      downloadFn()
    } finally {
      setTimeout(() => {
        setIsDownloading(null)
      }, 500)
    }
  }

  /**
   * Export as JSON format
   */
  const handleJSONExport = () => {
    handleDownload('json', () => downloadAsJSON(workplan, `${fileName}.json`))
  }

  /**
   * Export as Markdown format
   */
  const handleMarkdownExport = () => {
    handleDownload('markdown', () =>
      downloadAsMarkdown(workplan, `${fileName}.md`),
    )
  }

  /**
   * Export as CSV format
   */
  const handleCSVExport = () => {
    handleDownload('csv', () => downloadAsCSV(workplan, `${fileName}.csv`))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hideCloseButton
      classNames={{
        base: 'export-panel-container',
        wrapper: 'z-50',
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          Export
        </ModalHeader>
        <ModalBody>
          <div className="mb-4">
            <Input
              label="Filename"
              labelPlacement="outside"
              placeholder="Enter filename"
              value={fileName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFileName(e.target.value)}
              description="File extension will be added automatically"
              startContent={
                <svg
                  className="h-5 w-5 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                    clipRule="evenodd"
                  />
                </svg>
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-3 mb-5">
            <Button
              onClick={handleJSONExport}
              variant="bordered"
              color="primary"
              className="justify-start"
              startContent={
                isDownloading === 'json' ? (
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <span>📄</span>
                )
              }
              isLoading={isDownloading === 'json'}
              isDisabled={isDownloading !== null}
            >
              Export as JSON
            </Button>

            <Button
              onClick={handleMarkdownExport}
              variant="bordered"
              color="secondary"
              className="justify-start"
              startContent={
                isDownloading === 'markdown' ? (
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <span>📝</span>
                )
              }
              isLoading={isDownloading === 'markdown'}
              isDisabled={isDownloading !== null}
            >
              Export as Markdown
            </Button>

            <Button
              onClick={handleCSVExport}
              variant="bordered"
              color="success"
              className="justify-start"
              startContent={
                isDownloading === 'csv' ? (
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <span>📊</span>
                )
              }
              isLoading={isDownloading === 'csv'}
              isDisabled={isDownloading !== null}
            >
              Export as CSV
            </Button>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Export Format Explanation:
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
              <li>
                <span className="font-medium text-blue-600 dark:text-blue-400">JSON:</span> Original
                data format. Ideal for reuse or import in other applications.
              </li>
              <li>
                <span className="font-medium text-purple-600 dark:text-purple-400">Markdown:</span>{' '}
                Readable document format. Can be displayed in GitHub and similar
                platforms.
              </li>
              <li>
                <span className="font-medium text-green-600 dark:text-green-400">CSV:</span> Format
                for spreadsheet software. Suitable for analysis in Excel and
                similar tools.
              </li>
            </ul>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={onClose}
            variant="light"
            color="default"
          >
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default ExportPanel
