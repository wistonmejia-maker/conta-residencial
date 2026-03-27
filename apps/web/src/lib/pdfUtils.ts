import { PDFDocument, rgb, StandardFonts, degrees, PageSizes } from 'pdf-lib'

export const STAMP_MARGIN = 40 // Reserved bottom area for stamps (~1.4cm)

// Helper to check if buffer is PDF
export const isPdfFile = (buffer: Uint8Array) => {
    const header = new Uint8Array(buffer.slice(0, 5))
    return String.fromCharCode(...header) === '%PDF-'
}

// Helper to draw watermark at the visual bottom center, handling page rotation
export const drawBottomWatermark = (page: any, text: string, font: any, size: number) => {
    const { width, height } = page.getSize()
    const rotation = page.getRotation().angle
    const textWidth = font.widthOfTextAtSize(text, size)
    const margin = STAMP_MARGIN / 2

    let x = (width - textWidth) / 2
    let y = margin

    if (rotation === 90) {
        x = width - margin
        y = (height - textWidth) / 2
    } else if (rotation === 180) {
        x = (width + textWidth) / 2
        y = height - margin
    } else if (rotation === 270) {
        x = margin
        y = (height + textWidth) / 2
    }

    page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(0.4, 0.4, 0.4), // Medium gray for B&W compatibility
        rotate: degrees(rotation)
    })
}

/**
 * Splits text into multiple lines if it exceeds maxWidth
 */
export const splitTextIntoLines = (text: string, maxWidth: number, font: any, fontSize: number): string[] => {
    if (!text) return ['']
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        const testWidth = font.widthOfTextAtSize(testLine, fontSize)
        if (testWidth > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = word
        } else {
            currentLine = testLine
        }
    }
    if (currentLine) lines.push(currentLine)
    return lines
}

/**
 * Rescales a source page into a new Letter size page, leaving STAMP_MARGIN at the bottom.
 */
export const rescaleAndPasteIntoLetter = async (mergedPdf: PDFDocument, sourcePdf: PDFDocument, sourcePageIndex: number) => {
    const [letterWidth, letterHeight] = PageSizes.Letter
    const newPage = mergedPdf.addPage([letterWidth, letterHeight])

    // Embed the source page
    const [embeddedPage] = await mergedPdf.embedPages([sourcePdf.getPage(sourcePageIndex)])

    // Calculate safe draw area
    const horizontalPadding = 40
    const topPadding = 40
    const bottomPadding = STAMP_MARGIN + 10 // Reserve space for stamp + extra gap

    const availableWidth = letterWidth - (horizontalPadding * 2)
    const availableHeight = letterHeight - topPadding - bottomPadding

    const scale = Math.min(
        availableWidth / embeddedPage.width,
        availableHeight / embeddedPage.height
    )

    const drawWidth = embeddedPage.width * scale
    const drawHeight = embeddedPage.height * scale

    newPage.drawPage(embeddedPage, {
        x: (letterWidth - drawWidth) / 2,
        y: bottomPadding + (availableHeight - drawHeight) / 2, // Centered in safe area
        width: drawWidth,
        height: drawHeight
    })

    return newPage
}

/**
 * Embeds an image file into a new Letter size page of the PDF.
 */
export const embedImageToPdf = async (pdfDoc: PDFDocument, imageBytes: ArrayBuffer, type: 'png' | 'jpg', watermarkText?: string) => {
    let image
    try {
        if (type === 'png') image = await pdfDoc.embedPng(imageBytes)
        else image = await pdfDoc.embedJpg(imageBytes)
    } catch (e) {
        console.error('Error embedding image:', e)
        return
    }

    const [letterWidth, letterHeight] = PageSizes.Letter
    const page = pdfDoc.addPage([letterWidth, letterHeight])

    // Scale image to fit within margins
    const margin = 40
    const maxWidth = letterWidth - (margin * 2)
    const maxHeight = letterHeight - (margin * 2) - STAMP_MARGIN

    const imgDims = image.scale(1)
    let scale = 1

    if (imgDims.width > maxWidth || imgDims.height > maxHeight) {
        scale = Math.min(maxWidth / imgDims.width, maxHeight / imgDims.height)
    }

    const displayWidth = imgDims.width * scale
    const displayHeight = imgDims.height * scale

    // Draw image centered strictly above bottom area
    page.drawImage(image, {
        x: (letterWidth - displayWidth) / 2,
        y: STAMP_MARGIN + ((letterHeight - STAMP_MARGIN - displayHeight) / 2),
        width: displayWidth,
        height: displayHeight,
    })

    if (watermarkText) {
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
        drawBottomWatermark(page, watermarkText, font, 10)
    }
}
