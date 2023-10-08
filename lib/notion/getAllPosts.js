import { config as BLOG } from '@/lib/server/config'

import { idToUuid } from 'notion-utils'
import dayjs from 'dayjs'
import api from '@/lib/server/notion-api'
import getAllPageIds from './getAllPageIds'
import getPageProperties from './getPageProperties'
import filterPublishedPosts from './filterPublishedPosts'
import { Client } from '@notionhq/client';

/**
 * @param {{ includePages: boolean }} - false: posts only / true: include pages
 */
export async function getAllPosts({ includePages = false }) {
  const id = idToUuid(process.env.NOTION_PAGE_ID)

  const response = await api.getPage(id)

  const collection = Object.values(response.collection)[0]?.value
  const collectionQuery = response.collection_query
  const block = response.block
  const schema = collection?.schema

  const rawMetadata = block[id].value

  // Check Type
  if (
    rawMetadata?.type !== 'collection_view_page' &&
    rawMetadata?.type !== 'collection_view'
  ) {
    console.log(`pageId "${id}" is not a database`)
    return null
  } else {
    // Construct Data
    const pageIds = getAllPageIds(collectionQuery)
    const data = []
    for (let i = 0; i < pageIds.length; i++) {
      const id = pageIds[i]

      let properties = {}
      if (block[id]) {
        properties = (await getPageProperties(id, block, schema)) || null
        properties.date = (
          properties.date?.start_date
            ? dayjs.tz(properties.date?.start_date)
            : dayjs(block[id].value?.created_time)
        ).valueOf()
      } else {
        // 用官方sdk取page属性
        properties = await apiGetPageProperties(id)
        properties.date = dayjs(properties.date).valueOf()
      }

      // Add fullwidth to properties
      // properties.fullWidth = block[id].value?.format?.page_full_width ?? false
      properties.fullWidth = false

      // Convert date (with timezone) to unix milliseconds timestamp
      // properties.date = (
      //   properties.date?.start_date
      //     ? dayjs.tz(properties.date?.start_date)
      //     : dayjs(block[id].value?.created_time)
      // ).valueOf()


      data.push(properties)
    }

    // remove all the the items doesn't meet requirements
    const posts = filterPublishedPosts({ posts: data, includePages })

    // Sort by date
    if (BLOG.sortByDate) {
      posts.sort((a, b) => b.date - a.date)
    }
    return posts
  }
}


async function apiGetPageProperties(pageId) {

  const notion = new Client({ auth: process.env.NOTION_INTEGRATION_API_KEY });

  const response = await notion.pages.retrieve({ page_id: pageId });

  const properties = {
    "id": response.id,
    "date": response.properties.date.date?.start ?? 0,
    "type": [response.properties.type.select.name],
    "slug": response.properties.slug.rich_text[0].plain_text,
    "tags": response.properties.tags.multi_select.map(item => item.name),
    "summary": response.properties.summary.rich_text[0]?.plain_text ?? '',
    "title": response.properties.title.title[0].plain_text,
    "status": [response.properties.status.select.name],
  }

  return properties;


}